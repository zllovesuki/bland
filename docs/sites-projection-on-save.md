# Sites: precompute the page projection on save

Date: 2026-05-24
Constraints: no D1 schema change; no R2 envelope shape change; no projection on the
request path or the Durable Object startup path.

## Goal

Move the ProseMirror projection (Yjs snapshot -> ProseMirror JSON) off the public
Sites request path. Today it runs lazily on a cache miss inside the request. After
this change it runs in a queue consumer triggered by document creation and saves;
the request path only reads the already-projected JSON from R2 and renders it. The
static renderer (JSON -> HTML) stays on the request path.

## Decisions

1. Project on every doc save and on doc creation, regardless of publish state.
   There is no "project iff published" gate. The R2 JSON is a private projection
   artifact that mirrors the page body; publish and unpublish are pure D1 toggles
   with no R2 coordination.
2. Workspace R2 cleanup runs as its own queue message, enqueued by the workspace
   delete route (not inlined into the delete handler).
3. The Sites 404 component is refactored into a shared status shell that also
   renders a "come back later" page when the artifact is not yet built.
4. The R2 envelope shape stays `{ content, metrics, updatedAt }`. Do not add
   pageMentionIds / uploadIds (see Envelope).
5. The HTML ETag encodes the identity of the artifact actually rendered, not the
   page's expected `updated_at`. Since the request path can render a stale artifact,
   an ETag derived from `page.updated_at` would mislabel stale bytes as current and
   freeze them behind a 304 once the queue repairs the artifact. On a cache miss,
   read R2 before generating the ETag and fold the R2 object identity (httpEtag)
   into the HTML revision.

## Current implementation

- Request render path: `src/worker/sites/router.ts` `serveCachedOrRender`
  (router.ts:195-261) -> `loadPagePmJson` (load-page-pm-json.ts:24-50).
- `loadPagePmJson` reads R2 (`readSiteR2`, cache.ts:97-110). If the object is
  present and fresh (`customMetadata.updated_at === page.updated_at`), it returns
  the envelope. Otherwise it projects inline via `projectPageJson`
  (project-page-json.ts:17-43), which calls `DocSync.getSnapshotResponse` and runs
  Tiptap/y-tiptap, and returns a `writeBack` closure the router runs in `waitUntil`
  (router.ts:230).
- R2 envelope is `{ content, metrics, updatedAt }` with `customMetadata.updated_at`
  (cache.ts:112-122). Key is `${workspace_id}/${page_id}.json` (cache.ts:128-130).
- Freshness signal is `pages.updated_at`, advanced on every save by
  `recordDocSyncPageSave` (site-invalidation.ts:34-55) and on metadata PATCH
  (pages.ts:311-313).
- Queue: one binding `SEARCH_QUEUE` -> queue `bland-tasks` (wrangler.jsonc:71-85),
  single message type `{ type: "index-page", pageId }`. Dispatch in
  `src/worker/index.ts` `queue()` (index.ts:130-152). Producers at pages.ts:105
  (create), pages.ts:386 (archive), doc-sync.ts:244 (onSave).

The only request-path code that touches the DO and runs Tiptap is the
`loadPagePmJson` fallback. This work removes that fallback; R2 is fed from the queue
instead.

## Target design

- Doc page creation and onSave both enqueue a `page-projection` message (alongside
  the existing `index-page`). A consumer reads the snapshot, projects to JSON, and
  writes the same R2 envelope under the same key, stamped with `page.updated_at`.
  Creating the artifact at creation time means even a never-edited empty doc has a
  private artifact, so publishing it does not cause a first-visit "building" page.
- The request path becomes read-only over R2:
  - envelope present and fresh -> render it.
  - envelope present and stale -> enqueue a refresh, render the stale envelope
    (200, cached for the existing 300s); self-heals.
  - envelope missing -> enqueue a refresh, render a "come back later" page (503,
    no-store, auto-refresh); not cached.
- On a cache miss the R2 read happens before ETag generation, and the ETag encodes
  the rendered artifact's identity (R2 httpEtag), so a stale render is never
  mislabeled as current. Cache hits keep serving the stored ETag.
- The static renderer, mention reachability resolution, page-mention redaction, and
  `/uploads/ -> /_assets/` rewrite all stay on the request path (none touch the DO).

## Changes

### 1. Queue binding rename + message union

The Cloudflare queue resource `bland-tasks` is already generically named; leave it.
Only the binding identifier is renamed now that it carries more than search.

- wrangler.jsonc:74 producer binding `SEARCH_QUEUE` -> `TASKS_QUEUE`. The consumer
  block (keyed by queue name) is unchanged. Zero infra migration.
- Regenerate `worker-configuration.d.ts` (binding type rename at line 8) via
  `wrangler types`; do not hand-edit.
- New module `src/worker/queues/messages.ts`:

  ```ts
  export type TasksQueueMessage =
    | { type: "index-page"; pageId: string }
    | { type: "page-projection"; pageId: string }
    | { type: "workspace-sites-cleanup"; workspaceId: string };
  ```

- Update the three existing producers to use `TASKS_QUEUE`: pages.ts:105,
  pages.ts:386, doc-sync.ts:244.

### 2. Dispatch (src/worker/index.ts queue(), index.ts:130-152)

Switch on `body.type` for the three variants. Each handler returns
`{ kind: "ok" } | { kind: "retry"; delaySeconds: number }`, mirroring the existing
search handler.

```ts
const body = msg.body as TasksQueueMessage;
let result: { kind: "ok" } | { kind: "retry"; delaySeconds: number } = { kind: "ok" };
switch (body.type) {
  case "index-page":
    result = await handleSearchIndexMessage({ type: "index-page", pageId: body.pageId }, env);
    break;
  case "page-projection":
    result = await handlePageProjection(body.pageId, env);
    break;
  case "workspace-sites-cleanup":
    result = await handleWorkspaceSitesCleanup(body.workspaceId, env);
    break;
  default:
    log.warn("unknown_message_type", { type: (body as { type?: string }).type });
}
if (result.kind === "retry") {
  msg.retry({ delaySeconds: result.delaySeconds });
  continue;
}
msg.ack();
```

The catch block must log a generic id (do not assume `pageId`; cleanup carries
`workspaceId`).

### 3. page-projection consumer (new: src/worker/queues/page-projection.ts)

```ts
export async function handlePageProjection(pageId: string, env: Env) {
  const { db } = createSessionDb(env.DB, "first-primary"); // same as search-indexer
  const page = await db
    .select({ workspace_id: pages.workspace_id, kind: pages.kind, updated_at: pages.updated_at })
    .from(pages)
    .where(eq(pages.id, pageId))
    .get();

  // Bookmark race: consumer outran the producer's write. Retry (search-indexer.ts:34).
  if (!page) return { kind: "retry", delaySeconds: 2 } as const;

  // Sites serves documents only. Projecting a canvas via the doc store yields an
  // empty fragment; skip the wasted snapshot read. Content-type correctness, not a
  // publish gate.
  if (page.kind !== "doc") return { kind: "ok" } as const;

  // ADR (load-page-pm-json.ts:33): keep Tiptap/y-tiptap out of Worker cold start.
  const { projectPageJson } = await import("@/worker/sites/project-page-json");
  const projected = await projectPageJson(env, pageId); // empty-doc fallback if snapshot missing
  if (!projected) return { kind: "ok" } as const;

  await writeSiteR2(env, page.workspace_id, pageId, {
    content: projected.content,
    metrics: projected.metrics,
    updatedAt: page.updated_at,
  });
  return { kind: "ok" } as const;
}
```

Notes:

- Stamps `envelope.updatedAt = page.updated_at`, so the next request's freshness
  check (cache.ts:108) matches.
- Reuses `projectPageJson` unchanged (the single shared Yjs -> PM helper).
- Duplicate and out-of-order messages are harmless: the request path treats a stale
  R2 artifact as valid-but-repairable (serve + re-enqueue), and D1 remains the
  publication/access authority. The consumer reads the live snapshot and live
  `updated_at` at processing time, so a late message rewrites the latest state and
  any residual mismatch is corrected by the next self-heal.

### 4. workspace-sites-cleanup consumer (new: src/worker/queues/workspace-sites-cleanup.ts)

Deletes every Sites R2 artifact under the workspace prefix, using the repo's R2
pagination pattern (tests/worker/routes/upload-\*.workers.test.ts: `list({ cursor })`,
`truncated`, `cursor`).

```ts
export async function handleWorkspaceSitesCleanup(workspaceId: string, env: Env) {
  const prefix = `${workspaceId}/`;
  let cursor: string | undefined;
  do {
    const listing = await env.SITES.list({ prefix, cursor });
    if (listing.objects.length > 0) {
      await env.SITES.delete(listing.objects.map((o) => o.key)); // R2 batch delete (<=1000)
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  return { kind: "ok" } as const;
}
```

For realistic workspace sizes this stays within the per-invocation subrequest
budget. For unbounded scale, carry the cursor in the message and re-enqueue.

### 5. Producers

- doc-sync.ts onSave (doc-sync.ts:242-247): replace the single send with a batch,
  still inside the existing try/catch so a queue failure cannot break snapshot
  persistence (spec S7):

  ```ts
  try {
    await this.env.TASKS_QUEUE.sendBatch([
      { body: { type: "index-page", pageId: this.name } satisfies TasksQueueMessage },
      { body: { type: "page-projection", pageId: this.name } satisfies TasksQueueMessage },
    ]);
  } catch (e) {
    dl.error("queue_send_failed", errorContext(e));
  }
  ```

- pages.ts create handler (pages.ts:103-108): for a doc page, also enqueue
  `page-projection` so the artifact exists from creation (the consumer writes an
  empty envelope when there is no snapshot yet). Canvas creates send only
  `index-page` (the consumer would skip a canvas anyway). Keep the existing
  try/catch around the enqueue:

  ```ts
  const messages: TasksQueueMessage[] = [{ type: "index-page", pageId }];
  if (kind === "doc") messages.push({ type: "page-projection", pageId });
  try {
    await c.env.TASKS_QUEUE.sendBatch(messages.map((body) => ({ body })));
  } catch {
    // Non-critical: FTS + Sites projection are derived; recovered on next save/visit.
  }
  ```

- workspaces.ts delete handler (workspaces.ts:152-187): after the D1 batch succeeds
  (workspaces.ts:186), enqueue cleanup, best-effort:

  ```ts
  try {
    await c.env.TASKS_QUEUE.send({ type: "workspace-sites-cleanup", workspaceId } satisfies TasksQueueMessage);
  } catch (e) { log.error("sites_cleanup_enqueue_failed", { workspaceId, ... }); }
  ```

- Unchanged producers: archive (pages.ts:386) sends only `index-page`. Publish and
  unpublish (sites.ts:178-220) stay D1-only and never touch R2; the request resolver
  fail-closes in D1, so unpublish is effective immediately without deleting R2.

### 6. Remove deleteSiteR2 from unpublish

Deleting on unpublish is unnecessary: the next save re-creates the artifact, and
correctness does not depend on it (the resolver fail-closes in D1 before R2 is read).

- sites.ts:210-217: remove the `deleteSiteR2` call and its try/catch.
- sites.ts:17: remove the now-unused import.
- cache.ts:124-126: remove `deleteSiteR2` (no remaining callers; cleanup uses prefix
  delete, not per-page delete).

### 7. Request path: loadPagePmJson becomes read-only

`src/worker/sites/load-page-pm-json.ts` (load-page-pm-json.ts:24-50):

```ts
export interface LoadedPmJson {
  content: JSONContent;
  metrics: EditorTextMetrics;
  stale: boolean; // envelope present but updated_at behind page.updated_at
  artifactEtag: string; // R2 object identity of the rendered bytes; folded into the HTML ETag
}
export interface LoadPagePmJsonArgs {
  env: Pick<Env, "SITES">; // DocSync removed -> request path is structurally DO-free
  page: ResolvedPublishedPage;
  timings?: SiteTiming;
}
export async function loadPagePmJson({ env, page, timings }: LoadPagePmJsonArgs): Promise<LoadedPmJson | null> {
  const r2 = await timeMaybe(timings, "r2_document", () =>
    readSiteR2(env, page.workspace_id, page.id, page.updated_at),
  );
  if (!r2?.envelope) return null; // missing
  return { content: r2.envelope.content, metrics: r2.envelope.metrics, stale: !r2.fresh, artifactEtag: r2.etag };
}
```

- Drop the dynamic `projectPageJson` import and the `writeBack` field.
- `readSiteR2` (cache.ts:97-110) must also return the R2 object identity: add
  `etag: object.httpEtag` to its result (alongside `envelope`, `fresh`). httpEtag
  changes on every PUT, so it is the strongest body-identity signal;
  `envelope.updatedAt` (== customMetadata.updated_at) is an acceptable equivalent
  since the consumer stamps it from `page.updated_at`.
- `prepare-page-render.ts` (the only other consumer) reads `pmJson.content` /
  `.metrics`, so it is unaffected; the `stale` / `artifactEtag` fields are ignored
  there.

### 8. Request path: serveCachedOrRender (R2-before-ETag, missing/stale branches)

`src/worker/sites/router.ts` `serveCachedOrRender` (router.ts:195-261). Today it
computes the revision/ETag from page metadata, runs an If-None-Match 304 check and
an inline cache check, then calls `loadPagePmJson` (which used to project). Two
problems under the push model: (a) the ETag derives from `page.updated_at`, but the
body may be a stale artifact, so the ETag mislabels stale bytes as current and a
revalidation 304-freezes them; (b) the inline cache check is now dead because
`serveHtmlCacheHit` (router.ts:109/139) already ran. Reorder so the R2 read comes
first and the ETag encodes the artifact actually rendered:

```ts
// (rendererVersion, currentIsHome, canonicalPath, canonicalUrl as before)
const pmJson = await loadPagePmJson({ env: c.env, page, timings: ... });
if (!pmJson) {
  c.executionCtx.waitUntil(enqueuePageProjection(c.env, page.id)); // best-effort
  return siteBuilding(c, site); // 503, no-store, no ETag, not cached
}
// ETag includes the rendered artifact's identity, not page.updated_at alone.
const revision = await createSiteHtmlRevision({
  rendererVersion, site, page, currentIsHome, canonicalPath, artifactEtag: pmJson.artifactEtag,
});
const baseHeaders = buildHtmlHeaders(site, page, revision);
if (siteHtmlEtagMatches(request.headers.get("If-None-Match"), baseHeaders.ETag)) {
  return c.body(null, 304, baseHeaders); // matches the artifact we would serve
}
if (pmJson.stale) c.executionCtx.waitUntil(enqueuePageProjection(c.env, page.id));
// ... prepareSitePageRender + render stream; cache.put stores baseHeaders' ETag ...
```

- Delete the old early revision/304/inline-cache block (router.ts:207-226).
  `serveHtmlCacheHit` owns warm hits and their 304 using the stored (artifact-based)
  ETag via `cachedHtmlHeaders` (router.ts:310-315); leave it as is. The 304 above
  only handles "browser holds a copy but the edge cache missed," now compared
  against the artifact-based ETag.
- `cache.ts`: extend `SiteHtmlRevisionInput` and `createSiteHtmlRevision`
  (cache.ts:40-75) with `artifactEtag` and include it in the hashed input. This is a
  one-time ETag change on deploy (rendererVersion already busts ETags on deploy, so
  no special handling). Also derive `Last-Modified` (router.ts:299) from the artifact
  identity, not `page.updated_at`, so it does not claim freshness the stale body lacks.
- `enqueuePageProjection` wraps `TASKS_QUEUE.send({ type: "page-projection", pageId })`
  in try/catch so a queue failure never breaks the response.
- The building response returns before any `cache.put`, so it is never cached. It
  only occurs on an HTML-cache miss; `serveHtmlCacheHit` short-circuits warm hits,
  which only exist after a successful (non-building) render.

### 9. document.tsx: shared status shell + building page

`src/sites/document.tsx`. The 404 body (document.tsx:157-190) and the building page
share one shell.

- Add optional `metaRefreshSeconds?: number` to `SiteHead` (document.tsx:39-82); when
  set, render `<meta httpEquiv="refresh" content={String(metaRefreshSeconds)} />`.
- Extract a `SiteStatusDocument` component holding the shared shell (html + SiteHead
  - body + optional SiteHeader + centered main with mark/heading/sub/cta +
    SiteDeferredStyles). Props: `{ mark, heading, sub, ctaLabel, ctaHref, docTitle,
variantClass, metaRefreshSeconds? }`.
- `NotFoundDocument` becomes a thin wrapper: compute its existing strings from
  `readSitesHeaderRenderState()`, render `<SiteStatusDocument mark="404"
variantClass="site-not-found" .../>`. Keep its output byte-identical (the
  `site-not-found` / `site-not-found-mark` classes have no external CSS rule).
- New `BuildingDocument`: site is always present here. Copy, for example: heading
  "Hang tight.", sub "This page is being prepared and will refresh automatically.",
  cta "Back to {workspaceName}". `variantClass="site-building"`,
  `metaRefreshSeconds={3}`, and a muted mark (no big number).
- New `renderSiteBuildingDocumentHtml(props: NotFoundDocumentProps): string` that
  reuses `createSitesNotFoundRenderContext(props)` (it already carries exactly
  `{ assets, site }`; `readSitesHeaderRenderState` returns the site for the
  `not-found` context). The render-context union in `react-render-context.ts` does
  not need to change. Rename `createSitesNotFoundRenderContext` ->
  `createSitesStatusRenderContext` if a shared name reads better.

`src/worker/sites/router.ts`: add `siteBuilding(c, site)`, mirroring `siteNotFound`
(router.ts:335-353) but calling `renderSiteBuildingDocumentHtml`, status 503, headers
`{ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
"Retry-After": "5" }` plus the static preload headers. `site` is always non-null at
this call site.

## Envelope

The request path derives references from `content` with pure walks that touch no DO:
`collectMentionPageIds(content)` (prepare-page-render.ts:48) and the
`/uploads/ -> /_assets/` rewrite in `json-prewalk`. `pageMentionIds` would only save
one cheap walk; `uploadIds` has no consumer today (the asset gate is a separate
request, gated against D1). Keep the envelope byte-for-byte as
`SitePmJsonEnvelopeSchema` `{ content, metrics, updatedAt }`. If a future consumer
appears (agent structured-content RPC, mention-title-change invalidation), add a
`references` block in the consumer at that point.

## Lifecycle

- Created / refreshed: by the page-projection consumer, on doc page creation and on
  every save. Self-heal also enqueues on a request-path miss or stale read.
- Published root added: publish is D1-only. The artifact already exists from
  creation/saves, so publishing (even a never-edited doc) does not cause a
  first-visit building page.
- Published root removed (unpublish): D1-only; nothing touches R2. The artifact
  lingers as an unreferenced private projection; the resolver fail-closes so it is
  never served. Re-publish serves the (still current, kept fresh by saves) artifact
  with no building flash.
- Archived page: artifact lingers (resolver filters `archived_at`; never served).
- Canvas page: never projected (consumer skips `kind !== "doc"`).
- Removed: on workspace deletion (workspace-sites-cleanup deletes the whole
  `${workspaceId}/` prefix). Because every doc is projected, the orphan set is
  roughly all docs not currently in a published set (never-published, unpublished,
  archived); these are reclaimed by deferred GC, consistent with the repo's existing
  deferred orphan-uploads posture. An R2 lifecycle expiry rule is a possible future
  addition (caveat: a published-but-never-edited, rarely-visited page could expire
  and take a one-time building flash, so any TTL must be generous).

## Freshness and staleness bound

- `pages.updated_at` stays the freshness stamp. It is the only content-version signal
  the request path can read without touching the DO (the DO `snapshot_at` is DO-only;
  a D1 column would be a schema change, which is out of scope).
- A metadata-only PATCH (icon/cover/move, pages.ts:311-313) advances
  `pages.updated_at` without changing body content, so the envelope reads stale and
  triggers one self-healing re-projection (same content, re-stamped). This already
  happens today inline on the request path; this work moves it to the queue, off the
  hot path. It is self-limiting. Chrome (title/icon/cover) is D1-resolved into the
  ETag revision (cache.ts:51-75), so it renders correctly throughout.
- The ETag revision also encodes the rendered artifact's identity (Changes 7-8), so
  when the request path serves a stale artifact the ETag matches that stale body;
  once the queue repairs the artifact the ETag changes, and a browser revalidating
  its stale copy gets a 200 with fresh bytes, never a false 304.
- Net staleness bound is unchanged: ~300s (the HTML Cache API TTL,
  INTERNAL_HTML_CACHE_CONTROL, router.ts:44). Because onSave enqueues eagerly, R2 is
  essentially always fresh by the time the 300s HTML cache expires, so "serve stale +
  enqueue" is the rare safety net (lost enqueue, failed projection, metadata PATCH),
  not the common path.

## Edge cases

1. Created (doc), then published, never edited: creation enqueues page-projection ->
   consumer writes an empty envelope -> publishing and first visit render the empty
   page with no building flash. (Building appears only if the visit beats the
   creation projection, e.g. a queue backlog, and then self-heals.)
2. Saved then published (common): artifact exists from onSave -> first visit fresh.
3. Metadata PATCH: envelope stale -> serve stale + enqueue -> re-project + re-stamp;
   chrome already correct via D1/ETag.
4. Title edit: onSave updates pages.title + updated_at and enqueues; consumer
   re-stamps. Title shows via D1/ETag (title is not in the envelope).
5. Unpublish: D1 row removed, artifact untouched; resolver 404s.
6. Edit while unpublished: onSave still enqueues; consumer projects regardless, so
   the artifact stays current and re-publish has no stale window.
7. Canvas save: consumer skips (kind != doc).
8. Workspace delete: D1 batch + cleanup message -> prefix delete. (Uploads R2 blobs
   still orphan -- pre-existing deferred GC, out of scope.)
9. Concurrent / out-of-order messages: harmless -- stale R2 is valid-but-repairable
   and D1 is the publication authority; the consumer rewrites the latest state and
   any residual mismatch is corrected by the next self-heal.
10. Queue backlog: visitors see the building page (uncached, auto-refresh) until
    drained -- graceful degradation, not an error.
11. R2 write fails in consumer: message retries (Cloudflare default); request path
    serves stale/building meanwhile.
12. Thundering herd: during a brief building/stale window every visitor enqueues a
    refresh; bounded by the window length, batch coalescing (size 10 / 5s), and
    idempotent projection. Optional dampener: a small per-isolate recently-enqueued
    Set.
13. Stale render + conditional request: the ETag encodes the artifact identity, so a
    browser that cached a stale render revalidates against an ETag that changes the
    moment the queue repairs the artifact; it cannot be frozen on stale bytes by a
    false 304.
14. Pre-existing pages at deploy: pages created before this change have no artifact
    until their next save. A published one self-heals on first visit (building ->
    projected). No backfill is required; a one-time backfill (enqueue page-projection
    for the published set) is optional to avoid the first-visit flash.

## Impact on other subsystems

- Search indexing: shares the queue and dispatch; `index-page` behavior unchanged.
  onSave now sends 2 messages instead of 1 (slightly more queue volume). The dispatch
  refactor must preserve the `index-page` retry semantics.
- DocSync DO: onSave gains one batched send; `getSnapshotResponse` (doc-sync.ts:279)
  is reused by the consumer as-is. No DO startup-path change. No new DO-to-DO calls.
- Agent-readiness: `projectPageJson` stays the single shared Yjs -> PM projection
  helper; moving its call site to the consumer is compatible with a future
  getStructuredContent RPC reusing it.
- Sites request path: structurally DocSync-free (DocSync dropped from
  `LoadPagePmJsonArgs.env`). No Tiptap on Worker cold start (the consumer
  dynamic-imports it, same ADR as load-page-pm-json.ts:33).
- HTML Cache API / ETag revision: the ETag revision now includes the rendered
  artifact's identity (R2 httpEtag), and on a cache miss the R2 read precedes ETag
  generation (Changes 7-8). Cache hits still serve the stored ETag with no R2 read.
- Config: binding rename only; consumer config unchanged; worker-configuration.d.ts
  regenerated. No D1 migration; no envelope schema change.
- Queue consumer load: a batch (size 10) can now mix index-page and page-projection
  work, each doing a DO snapshot read + Yjs decode (projection also writes R2). This
  is within the consumer CPU/wall budget for realistic docs; if large documents cause
  pressure, lower max_batch_size for this queue. The projection already ran
  one-at-a-time on the request path before; it now runs in the consumer.

## Test changes

These existing tests assert the old synchronous-render and delete-on-unpublish
behavior and must change:

- tests/worker/routes/sites.workers.test.ts:411-434 ("DELETE removes the page's
  cached R2 artifact"): the final assertion flips. Unpublish no longer deletes R2.
  Rewrite to assert the artifact remains (`readSiteR2(...)` not null) and that public
  reachability is gated in D1; change `toBeNull()` to `not.toBeNull()` and rename the
  test.
- tests/worker/sites/dispatch.workers.test.ts render suite: tests that fetch a
  published page without pre-seeding R2 rely on request-path projection (the
  empty-doc fallback, e.g. :179; or a seeded DocSync snapshot, e.g. :520/:526 via
  seedDocSyncSnapshot/buildYjsDocBytes; and the bounded-stale-after-unpublish test
  :406). Under the new model those first requests return the 503 building page.
  Populate R2 before the first fetch:
  - content tests: keep `seedDocSyncSnapshot(...)`, then `await
handlePageProjection(page.id, env)` to write R2, then fetch (exercises snapshot ->
    consumer -> R2 -> render end to end).
  - body-agnostic tests (:179, :406): pre-seed with `writeSiteR2(env, ws.id, page.id,
{ content: emptyDoc, metrics, updatedAt: page.updated_at })`.
  - No change: :497 ("renders from a fresh R2 PM JSON envelope without re-projecting")
    and :593 already pre-seed R2 and validate the target path. :520 and :561 hold
    once R2 is populated (HTML-cache precedence and ETag/304 behavior are unchanged).
  - Add a `projectSitePage(env, pageId)` helper in tests/worker/helpers/sites.ts
    wrapping `handlePageProjection`.
- tests/sites/document.test.tsx: the SiteStatusDocument extraction must keep the
  not-found output it asserts byte-stable; add coverage for the building variant
  (renderSiteBuildingDocumentHtml), including the meta refresh tag.
- tests/e2e/specs/27-sites-publish.spec.ts: publish-then-visit can transiently hit
  the building page until the queue projects. Wait for the rendered page (auto-retry
  assertion, aided by the building page's meta refresh) instead of asserting content
  on the first navigation.

New tests to add (call handlers directly; do not depend on queue auto-consumption,
like search-indexer.workers.test.ts):

- handlePageProjection: doc with snapshot -> writes R2; snapshot missing -> empty
  envelope; kind=canvas -> skip; page row not visible -> retry.
- handleWorkspaceSitesCleanup: seed several `${wid}/...json` objects -> prefix empty
  after handling; objects under other prefixes survive.
- Request path: missing R2 -> 503 building (Cache-Control: no-store, Retry-After, not
  cached); stale R2 (page.updated_at advanced past the envelope) -> 200 with the
  stale body.
- ETag identity: render an artifact, capture the ETag; advance page.updated_at and
  repair the artifact via the consumer; the new render's ETag differs, and a request
  with If-None-Match set to the old ETag gets 200 (fresh), not 304. Two renders of
  the same artifact share an ETag (304 still works for unchanged bytes).

## Validation

- `npm run typecheck` and `npm run lint`. Run `npm run build` (queue runtime
  registration, route wiring, and Worker exports change).
- Worker and E2E test updates per "Test changes". Shared/static renderer tests are
  unaffected.
- After the rename, sweep: `rg -n "SEARCH_QUEUE"` must return nothing in src; confirm
  worker-configuration.d.ts is regenerated.

## Out of scope

- Orphan GC for artifacts of docs not currently served (never-published, unpublished,
  archived) beyond workspace deletion. Project-everything makes this set roughly all
  unpublished docs; deferred, consistent with deferred orphan-uploads GC.
- Coalescing the two onSave messages (index + projection) to a single snapshot read
  per page per batch (both currently read the DO snapshot once each).
- Uploads R2 blob cleanup on workspace deletion (pre-existing deferred gap; the D1
  `uploads` rows are deleted, the R2 blobs are not).
- Search index DO teardown on workspace deletion (deferred; eventual eviction).

## Implementation checklist (file by file)

- [ ] wrangler.jsonc:74 -- rename producer binding to `TASKS_QUEUE`.
- [ ] worker-configuration.d.ts -- regenerate (`wrangler types`).
- [ ] src/worker/queues/messages.ts -- new `TasksQueueMessage` union.
- [ ] src/worker/index.ts:130-152 -- 3-way dispatch; generic id in catch log.
- [ ] src/worker/queues/page-projection.ts -- new consumer (dynamic import, kind
      guard, bookmark-race retry, writeSiteR2).
- [ ] src/worker/queues/workspace-sites-cleanup.ts -- new consumer (prefix list+delete
      loop).
- [ ] src/worker/durable-objects/doc-sync.ts:242-247 -- sendBatch index +
      page-projection; rename binding.
- [ ] src/worker/routes/pages.ts:105 -- rename binding; create handler also enqueues
      page-projection for doc pages (sendBatch). pages.ts:386 (archive) rename only.
- [ ] src/worker/routes/workspaces.ts:~186 -- enqueue workspace-sites-cleanup after
      the D1 batch.
- [ ] src/worker/routes/sites.ts:17,210-217 -- remove deleteSiteR2 call + import.
- [ ] src/worker/sites/cache.ts -- readSiteR2 returns `etag: object.httpEtag`;
      SiteHtmlRevisionInput + createSiteHtmlRevision (cache.ts:40-75) include the
      artifact identity; remove unused deleteSiteR2 (cache.ts:124-126).
- [ ] src/worker/sites/load-page-pm-json.ts -- read-only; add `stale` + `artifactEtag`;
      drop writeBack + projectPageJson import; env -> Pick<Env,"SITES">.
- [ ] src/worker/sites/router.ts -- read R2 before ETag; ETag includes artifactEtag;
      move 304 after the R2 read; delete the dead early revision/304/inline-cache
      block; missing -> siteBuilding (503/no-store/Retry-After); stale -> enqueue +
      render; add `siteBuilding` + `enqueuePageProjection`; Last-Modified from artifact.
- [ ] src/sites/document.tsx -- SiteHead metaRefreshSeconds; extract
      SiteStatusDocument; NotFoundDocument wrapper; BuildingDocument;
      renderSiteBuildingDocumentHtml.
- [ ] tests -- page-projection + workspace-sites-cleanup worker tests; request-path
      missing/stale/ETag tests; Sites E2E building->fresh flow.
