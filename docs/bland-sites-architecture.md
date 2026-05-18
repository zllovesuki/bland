# bland sites architecture

Date: 2026-05-16

## Goal

Add a static publishing surface to `bland` for public sites, without disturbing
the live editor model or the agent-readiness plan.

In practice, the sites surface means each workspace can publish a tree of pages
under a custom subdomain `<slug>.bland.site`, served as HTML to anonymous
visitors with no WebSocket attachment, no D1 mutation per request, no live
collaboration, and no R2 garbage that can outlive a page.

Most-likely use cases: personal blogs, technical documentation, public
changelogs. The HTML must look like `/s/:token` minus the sidebar and the
breadcrumb chrome.

This note is intentionally separate from
[agent-ready-plan.md](./agent-ready-plan.md). Sites and agents share a
Worker-safe headless schema boundary and should not regress each other, but
they target different consumers and different write paths.

## Decision Summary

`bland` should ship Sites as a thin static-render-and-cache surface that piggybacks on existing
primitives:

- Two new D1 tables: `workspace_sites` (one per workspace, slug + nullable
  `published_at` + nullable `home_page_id`) and `published_pages` (explicit
  publish roots; subpages inherit publication).
- A new host-routed Worker branch that fires when the request hostname matches
  the configured `PUBLISHED_SITE_DOMAIN`. Dispatch happens BEFORE `/api/`,
  `/uploads/`, file-extension fast path, and the SPA shell.
- A new published-set CTE in `src/worker/lib/permissions.ts` (or a sibling
  module) that walks `pages.parent_id` up from the requested page until it
  hits a row in `published_pages` for the same workspace.
- Render path: Worker pulls the persisted Yjs snapshot from DocSync via the
  existing `getSnapshotResponse` RPC, projects `YJS_DOCUMENT_STORE` into a
  ProseMirror `Node` via `@tiptap/y-tiptap`, then renders to HTML through the
  existing `renderBlandSitesDocumentToReactElement` static renderer
  (`src/sites/server/static-renderer/`).
- Cache: in-memory Worker Cache API keyed on a server-normalized URL with
  `?v=<pages.updated_at>` appended; on miss, look up R2 at
  `sites/<workspace_id>/<page_id>.html`; on miss or stale, render fresh and
  `ctx.waitUntil(Promise.all([cache.put, R2.put]))`. D1 resolution always runs
  before the cache check, so unpublish, page move, archive, or site-disable
  are fail-closed even with stale cache entries.
- New entitlement class `getSitePublishingEntitlements(role)` gates
  publish/unpublish, set home page, change slug, manage site. Owner and admin
  only.
- Custom-domain support via Cloudflare for SaaS is deliberately out of scope
  and called out at the end as a follow-on feature.

The render primitive already exists. The headless schema already exists. The
streaming snapshot RPC already exists. The presentation components for image,
callout, code block, and page mention already exist. The work is in the
plumbing: host dispatch, two new tables, a CTE, an entitlement module, a small
API surface, and a thin site shell that wraps the renderer with title, icon,
cover, and host-specific head metadata.

## Relevant Source

Editor and schema:

- [src/shared/editor/schema/index.ts](../src/shared/editor/schema/index.ts)
- [src/shared/editor/components/](../src/shared/editor/components/)
- [src/sites/server/static-renderer/index.ts](../src/sites/server/static-renderer/index.ts)
- [src/sites/server/static-renderer/node-mappings.tsx](../src/sites/server/static-renderer/node-mappings.tsx)
- [src/sites/server/static-renderer/types.ts](../src/sites/server/static-renderer/types.ts)
- [tests/sites/server/static-renderer.test.ts](../tests/sites/server/static-renderer.test.ts)

Worker plumbing and rendering inputs:

- [src/worker/index.ts](../src/worker/index.ts)
- [src/worker/lib/http-entry.ts](../src/worker/lib/http-entry.ts)
- [src/worker/lib/spa-shell.ts](../src/worker/lib/spa-shell.ts)
- [src/worker/router.ts](../src/worker/router.ts)
- [src/worker/durable-objects/doc-sync.ts](../src/worker/durable-objects/doc-sync.ts)
- [src/worker/routes/pages.ts](../src/worker/routes/pages.ts)
- [src/worker/routes/shares.ts](../src/worker/routes/shares.ts)
- [src/worker/routes/uploads.ts](../src/worker/routes/uploads.ts)
- [src/worker/routes/workspaces.ts](../src/worker/routes/workspaces.ts)
- [src/worker/lib/permissions.ts](../src/worker/lib/permissions.ts)

Client visual reference (NOT to be imported by the Worker):

- [src/client/components/share/page-view.tsx](../src/client/components/share/page-view.tsx)
- [src/client/components/editor/document-page.tsx](../src/client/components/editor/document-page.tsx)
- [src/client/components/ui/page-chrome.tsx](../src/client/components/ui/page-chrome.tsx)
- [src/client/components/ui/page-cover.tsx](../src/client/components/ui/page-cover.tsx)

Schema, entitlements, shared types:

- [src/worker/db/d1/schema.ts](../src/worker/db/d1/schema.ts)
- [src/shared/entitlements/](../src/shared/entitlements/)
- [src/shared/types.ts](../src/shared/types.ts)
- [src/lib/slugify.ts](../src/lib/slugify.ts)

## Current Live State

### What already exists

- `5dda11b` extracted `src/shared/editor/schema/` as a Worker-safe headless
  schema module and added the static renderer now located under
  `src/sites/server/static-renderer/` with
  `renderBlandSitesDocumentToReactElement(content, options)`, exercised in
  `tests/sites/server/static-renderer.test.ts` with `renderToStaticMarkup`
  and `renderToReadableStream`. This is the render primitive for Sites.
- `@tiptap/y-tiptap@^3.0.3` is already a dependency and exposes
  `yXmlFragmentToProseMirrorRootNode(fragment, schema)` which returns a
  ProseMirror `Node`. The static renderer accepts either a `Node` or a
  `JSONContent`, so the Worker can feed either form.
- `DocSync.getSnapshotResponse(pageId)` already streams the persisted Yjs
  snapshot out of DO-local SQLite for cold editor bootstrap. Sites can reuse
  the same RPC without adding hot paths to the collaboration object.
- `pages.updated_at` is already touched by `DocSync.onSave` after every
  snapshot write and by `PATCH /workspaces/:wid/pages/:id` for metadata
  changes. It is therefore a valid cache-bust signal for both body and chrome.
- `PageMentionPresentation` already supports a `kind: "restricted"` path that
  drops `data-page-id` and renders an inert "Restricted" span with a lock
  icon. Sites can lean on this to fail safe for cross-published mentions.
- `RESERVED_SLUGS` and the workspace slug validator pattern in
  `src/shared/types.ts` give us a starting point for a sibling site slug
  validator.

### What is missing

- No host-based dispatch in the Worker entry. `handleHttpRequest` routes
  purely on path prefix and method.
- No D1 tables for sites or publication state.
- No CTE that walks `pages.parent_id` and checks `published_pages`.
- No Worker route that resolves a site host, projects Yjs to ProseMirror, runs
  the static renderer, wraps it in a site shell, and writes through to R2 and
  the Cache API.
- No site management API endpoints, no UI surface in workspace settings, no
  per-page publish affordance.
- No `PUBLISHED_SITE_DOMAIN` environment variable in `.dev.vars.example`,
  `wrangler.jsonc`, or `worker-configuration.d.ts`.
- No site-aware image asset gate; `/uploads/:id` requires either an
  authenticated cookie or a `?share=` token.
- No `getSitePublishingEntitlements` module.

## Non-Goals

These should not be in the first cut:

- Custom domain support via Cloudflare for SaaS. That is a deliberate
  follow-on once apex/subdomain works end to end.
- Eager pre-rendering of every subpage at publish time. Sites render lazily on
  first request and write through to R2.
- A "draft preview" mode for unpublished pages. Members already see canonical
  pages inside the app.
- A separate `published_documents` parallel store. The R2 HTML object is a
  derived projection; D1 plus DocSync remain authoritative.
- Mutating the live collaboration object to do ProseMirror or render work.
- Per-revision R2 keys or any revision-hash component in the R2 path.
- Auth tokens, presigned URLs, or share-style query parameters on the public
  site surface.
- Site-level theming, custom CSS, custom JS, embedded analytics, or any
  user-controlled head tags.
- Comment threads, reactions, view counters, or anything that requires write
  amplification per visit.
- Canvas page publication. Sites are document-only in v1; publish endpoints
  must reject `kind='canvas'`.
- Sitemaps, RSS feeds, twitter:card, theme-color, or PWA manifests in v1.

## Target Contract

### Public surface (host: `<slug>.bland.site` or apex `bland.site`)

```
GET/HEAD /                                  -> site home (renders home_page_id in place) or 404
GET/HEAD /<page-slug>-<pageId>              -> page content; 308 to canonical slug if mismatch
GET/HEAD /_assets/<pageId>/<uploadId>       -> public asset gated on published-set membership
GET      /robots.txt                        -> "User-agent: *\nAllow: /\n"
GET      /sitemap.xml                       -> deferred (404 in v1)
```

Apex behavior is intentionally narrow: the apex host renders a minimal
centered "bland." placeholder. No commitment to redirect, directory, or
landing page until product asks.

### Site management surface (host: canonical app host, under `/api/v1`)

```
GET    /workspaces/:wid/site                                   -> { site: WorkspaceSite | null }
PATCH  /workspaces/:wid/site                                   -> upsert { slug?, home_page_id?, published? }
GET    /workspaces/:wid/site/slug-availability?slug=<slug>     -> { available: boolean, reason?: string }
GET    /workspaces/:wid/site/pages                             -> { published_roots: PublishedPage[] }
POST   /workspaces/:wid/site/pages/:id                         -> add explicit publish root
DELETE /workspaces/:wid/site/pages/:id                         -> remove explicit publish root
```

All site management routes:

- require workspace membership AND owner/admin role via
  `getSitePublishingEntitlements(role).manageSite`,
- fail closed with 404 when `PUBLISHED_SITE_DOMAIN` is unset (the feature is
  effectively disabled),
- continue to enforce existing 403/404 leak rules around membership.

### URL grammar

- Page path is exactly `/<page-slug>-<pageId>` where `<page-slug>` is
  `slugify(title)` and `<pageId>` is the ULID. If `slugify(title)` is empty,
  fall back to `untitled`.
- `<pageId>` is the resolver. `<page-slug>` is cosmetic.
- A request whose `<page-slug>` does not equal the canonical slugify of the
  current title 308s to `<canonical-slug>-<pageId>`, preserving query string.
- A request for `<home-slug>-<homePageId>` 308s to `/`. The home page only
  exists at the root path; this avoids a duplicate canonical URL.
- Subpages of subpages flatten: `parent/child` becomes `/<child-slug>-<id>`,
  not `/<parent-slug>-<id>/<child-slug>-<id>`. Pages do not nest in the URL
  even when they nest in the workspace.

### Safety invariants

- Public surface is unauthenticated. There is no session, no JWT, no share
  token, no cookie. Anything that would be "private" must be filtered at
  resolution, not at presentation.
- D1 site/page resolution runs before Cache API or R2 lookup. Stale cache is
  acceptable only when D1 still says the content is published. Unpublishing
  is effective immediately for all subsequent visitors.
- The R2 body is slug-neutral and host-neutral. Any canonical URL, og:url,
  og:image absolute URL, or host-specific head tag is injected by the Worker
  at serve time, not stored.
- Static renderer is fed pre-resolved page mention data, never a raw resolver
  callback that could leak unreachable pageIds.
- Asset gating requires the upload's owning page to be the requested page
  AND the requested page to be in the published set of the requesting site
  host. Cross-page or cross-site asset reuse is rejected.

## Resolver Shape

```ts
type SiteHostMatch =
  | { kind: "subdomain"; slug: string; baseDomain: string }
  | { kind: "apex"; baseDomain: string }
  | { kind: "none" };

function matchSiteHost(url: URL, env: Env): SiteHostMatch {
  const baseDomain = env.PUBLISHED_SITE_DOMAIN?.trim();
  if (!baseDomain) return { kind: "none" };

  const host = url.hostname.toLowerCase();
  if (host === baseDomain) return { kind: "apex", baseDomain };

  const suffix = "." + baseDomain;
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, host.length - suffix.length);
    if (slug.length > 0 && !slug.includes(".")) {
      return { kind: "subdomain", slug, baseDomain };
    }
  }

  return { kind: "none" };
}
```

`PUBLISHED_SITE_DOMAIN` works the same way for production and local dev. With
`bland.localhost`, `sup.bland.localhost` resolves as a subdomain and
`bland.localhost` resolves as apex. No special branching for local; ports do
not affect matching because `URL.hostname` strips them.

## Data Model

Two new D1 tables. Both follow the existing `src/worker/db/d1/schema.ts`
conventions: text PKs, `(datetime('now'))` defaults, FK references.

### `workspace_sites`

```ts
export const workspaceSites = sqliteTable("workspace_sites", {
  workspace_id: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  home_page_id: text("home_page_id").references(() => pages.id, {
    onDelete: "set null",
  }),
  published_at: text("published_at"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

Notes:

- `workspace_id` is the PK because the product invariant is one site per
  workspace. No separate ULID.
- `slug` is unique across all workspaces.
- `home_page_id` is nullable. When null, `/` returns 404 until a home page is selected.
- `published_at` toggles the site on and off. Null means the site is disabled
  and the resolver fails closed regardless of `published_pages` content.
- `home_page_id` must point to a page in the same workspace with `kind='doc'`
  and not be archived. The FK cannot enforce same-workspace or kind alone; the
  PATCH handler must check.
- Backfill: workspace creation should insert one `workspace_sites` row with
  `slug = workspaces.slug`, `published_at = null`, `home_page_id = null`. That
  removes a "row missing" edge case from the management API.

### `published_pages`

```ts
export const publishedPages = sqliteTable(
  "published_pages",
  {
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    page_id: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    published_by: text("published_by")
      .notNull()
      .references(() => users.id),
    published_at: text("published_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.workspace_id, t.page_id] }), index("idx_published_pages_page").on(t.page_id)],
);
```

Notes:

- Stores explicit publish roots. Subpages are implicitly published; no row is
  inserted per descendant. The CTE finds the nearest ancestor that has a row.
- `workspace_id` is redundant given the FK to `pages.id`, but it lets the CTE
  constrain by workspace without an extra join and keeps the PK index small.
- `idx_published_pages_page` exists because `page_id` is not leftmost in the
  composite PK; the membership check in the CTE keys on a specific ancestor
  pageId.
- Unpublish deletes the row. There is no `unpublished_at`. If an ancestor and
  leaf are both explicit roots and the leaf is unpublished, the leaf is still
  implicitly published via the ancestor. That is the consistent behavior.
- `ON DELETE CASCADE` from `pages.id` and `workspaces.id` keeps the table
  clean when archived pages are eventually hard-deleted or workspaces are
  removed. Workspace deletion in `src/worker/routes/workspaces.ts` already
  explicitly deletes child tables; this new table must be added to that batch
  before `pages` and `workspaces` rows are deleted.

### Why not a `status` enum on `workspace_sites`

`published_at` is sufficient: null means disabled, non-null means enabled.
Adding `status` introduces a redundant invariant and forces all reads to check
both columns.

### Why not infer the publish set from `home_page_id`

Shared is not published. A workspace can have `home_page_id = X` while X is
not actually in `published_pages`, or vice versa. The publish set is a
deliberate authorization signal owned by an explicit publish row, not derived
from a structural pointer.

## Resolution

### Site host resolution

1. `matchSiteHost(request.url, env)` returns `subdomain | apex | none`.
2. `subdomain`: load `workspace_sites WHERE slug = ? AND published_at IS NOT NULL`.
   - If no row, 404 with a "site not found" body.
   - If row exists but `home_page_id` is null and the request is `GET /`, 404.
3. `apex`: render the centered "bland." placeholder body for v1.

### Page resolution

For a request `GET /<page-slug>-<pageId>` against a resolved site, run the
published-set CTE:

```sql
WITH RECURSIVE
site AS (
  SELECT workspace_id, slug, home_page_id, published_at
  FROM workspace_sites
  WHERE slug = ?
    AND published_at IS NOT NULL
),
ancestors(root_id, id, parent_id, depth) AS (
  SELECT p.id, p.id, p.parent_id, 0
  FROM pages p
  JOIN site s ON s.workspace_id = p.workspace_id
  WHERE p.id = ?
    AND p.archived_at IS NULL

  UNION ALL

  SELECT a.root_id, p.id, p.parent_id, a.depth + 1
  FROM ancestors a
  JOIN pages p ON p.id = a.parent_id
  JOIN site s ON s.workspace_id = p.workspace_id
  WHERE p.archived_at IS NULL
    AND a.depth < ?  -- MAX_TREE_DEPTH - 1
),
nearest_published AS (
  SELECT a.root_id, a.id AS published_root_id, a.depth
  FROM ancestors a
  JOIN site s
  JOIN published_pages pp
    ON pp.workspace_id = s.workspace_id
   AND pp.page_id = a.id
  ORDER BY a.depth ASC
  LIMIT 1
)
SELECT
  p.id,
  p.workspace_id,
  p.kind,
  p.title,
  p.icon,
  p.cover_url,
  p.updated_at,
  np.published_root_id
FROM site s
JOIN pages p ON p.id = ? AND p.workspace_id = s.workspace_id
JOIN nearest_published np ON np.root_id = p.id
WHERE p.archived_at IS NULL;
```

- No row returned: 404. The client cannot distinguish a missing page from an
  unreachable one.
- Row returned with `kind='canvas'`: 404 in v1. Canvas pages cannot be served
  via Sites.
- Row returned with `kind='doc'`: continue to the canonicalization and cache
  steps below.

This CTE is intentionally a sibling of the existing
`buildBatchPageAccessQuery` in `src/worker/lib/permissions.ts`. It walks the
same tree but joins a different table. Do not collapse the two: they serve
different principals and different invariants.

### Slug canonicalization

- Parse the trailing `-<pageId>` from the path. If the suffix is not a valid
  ULID, return 404 without resolving.
- Compare `<page-slug>` to `slugify(page.title) || "untitled"`. If they
  differ, 308 to the canonical slug, preserving query string.
- Only cache canonical 200 responses. 308s are not cached.

### Home page

- `GET /` always renders the home page inline, never 308s into the page URL.
  This avoids two canonical URLs for the same content.
- A request for `<home-slug>-<homePageId>` 308s to `/`.
- The home page must also pass the published-set CTE. UI prevents setting an
  unpublished page as home; resolver fails closed anyway if the UI is
  bypassed.

## Render Pipeline

Per request, after a successful resolve:

1. Compute the normalized cache key: take the request URL, drop visitor query
   params, append `?v=<pages.updated_at>`. Same hostname as the visitor URL.
2. `cache.match(normalizedKey)` -> if hit, return it (after a fresh header
   pass for `Cache-Control`, `ETag`, `Last-Modified`).
3. On miss, `R2.get("sites/<workspace_id>/<page_id>.html")`. Check the
   `customMetadata.updated_at` against the freshly-resolved `pages.updated_at`.
   - If equal, build the response from the R2 object and the Worker-injected
     host head tags, then `ctx.waitUntil(cache.put(normalizedKey, clone))`.
   - If stale or missing, render fresh.
4. Render fresh:
   - `const stub = env.DocSync.getByName(pageId);`
   - `const snap = await stub.getSnapshotResponse(pageId);`
   - If `snap.kind === "missing"`, render an empty body. The page still
     carries D1 title, icon, and cover.
   - Else, `const bytes = new Uint8Array(await snap.response.arrayBuffer());`
   - `const ydoc = new Y.Doc(); Y.applyUpdate(ydoc, bytes);`
   - `const fragment = ydoc.getXmlFragment(YJS_DOCUMENT_STORE);`
   - Build the schema once: `const schema = getSchema(createHeadlessEditorExtensions());`
   - `const node = yXmlFragmentToProseMirrorRootNode(fragment, schema);`
   - `const json = node.toJSON();`
   - Pre-walk `json` to (a) collect all `pageMention.attrs.pageId` values and
     batch-resolve them through the published-set CTE for this site, and (b)
     rewrite all `image.attrs.src` of the form `/uploads/<uploadId>` to
     `/_assets/<pageId>/<uploadId>`.
   - Render: `renderBlandSitesDocumentToReactElement(json, { resolvePageMention })`
     followed by `renderToStaticMarkup` to produce body HTML.
   - Wrap in a slug-neutral, host-neutral site shell with title, icon, cover
     (cover URL also rewritten if it points to `/uploads/<uploadId>`), and
     body. Cover paths must include a `pageId` segment to be eligible; gradient
     cover strings render directly without rewriting.
   - Buffer the full HTML body (v1 uses `renderToString`, not streaming).
   - `ctx.waitUntil(Promise.all([cache.put, R2.put]))` where:
     - `cache.put` writes the response clone keyed by `normalizedKey`.
     - `R2.put` writes the slug-neutral body with
       `customMetadata: { updated_at }`.

### Why buffered render, not streaming

Yjs application requires materializing the full update buffer into a `Y.Doc`
in Worker memory anyway. ProseMirror node construction also materializes
the full document. Streaming the HTML afterwards saves at most the HTML body
size from peak memory, which is already small for typical doc pages.
Streaming also complicates `R2.put`, `Content-Length`, `ETag`, and the Cache
API put because Cloudflare's docs note that chunked `put()` blocks
subsequent puts until completion. Buffer in v1; revisit only if real pages
hit a Worker memory or CPU ceiling.

### Mention safety

The static renderer accepts a synchronous `resolvePageMention(pageId)`. For
Sites:

- Pre-walk `json` for all `pageMention.attrs.pageId` values before render.
- Batch-resolve them against the published-set CTE for the current site.
- Build a `Map<pageId, { reachable: boolean; title?: string; icon?: string }>`.
- The `resolvePageMention` callback consults that map:
  - Reachable: return `{ label, href: "/<slugified-title>-<pageId>", icon, kind: "accessible" }`.
  - Unreachable: return `{ label: "Private page", href: null, kind: "restricted" }`
    AND the renderer must drop the real `pageId` before constructing
    `PageMentionPresentation`. Either feed `pageId: null` or extend
    `RenderBlandSitesDocumentOptions` with a `pageId` override path. The
    minimum-diff choice is to wrap the existing mapping so it passes `pageId:
null` for restricted mentions. This avoids leaking `data-page-id` in the
    static HTML.

The shape `kind: "restricted"` already exists in
`src/shared/editor/components/page-mention.tsx`, so no presentation work is
needed.

### Image src rewriting

`src/shared/editor/components/image.tsx` renders whatever `src` it receives.
Rewriting happens in the JSON pre-walk:

```
image.attrs.src === "/uploads/<uploadId>"
  -> set image.attrs.src = "/_assets/<pageId>/<uploadId>"
```

For `pageId`, use the nearest ancestor in the rendered document tree that is
a page boundary (in v1, the page being rendered; the renderer does not embed
foreign pages). If the upload's authoritative `uploads.page_id` does not
match the rendered page, the asset will 404 by design (see Asset Gating).
That is a known footgun and documented below.

Covers are not in the editor JSON. `pages.cover_url` strings of the form
`/uploads/<uploadId>` get rewritten to `/_assets/<pageId>/<uploadId>` at the
site shell layer.

## Cache Strategy

### Cache API

- Key: server-built `Request` whose URL keeps the visitor hostname and path,
  drops visitor query params (`?utm=...` etc.), and appends `?v=<updated_at>`.
- `cache.match(key)` and `cache.put(key, clone)`.
- `Cache-Control` on the response returned to the visitor:
  `public, max-age=0, must-revalidate` plus `ETag: "<updated_at>"` and
  `Last-Modified: <updated_at>`. This keeps browsers honest while letting
  Cloudflare's edge keep serving the cached body.
- `Cache-Tag` is deferred. Resolver-first means stale cache is never served.
  Add `Cache-Tag: site:<wid>, page:<pid>` later if and only if we add purge
  tooling.

### R2

- Object key: `sites/<workspace_id>/<page_id>.html`. No revision suffix, no
  slug component, no host component.
- `customMetadata.updated_at` matches `pages.updated_at` at the time of
  render. Reads compare to the resolver's `updated_at` and re-render on
  mismatch.
- Body is slug-neutral and host-neutral. Internal links are root-relative.
  Canonical URL and `og:url` are injected at serve time, not stored.
- Workers do not stream into R2 unless the body length is known. v1 buffers
  the full HTML body, so `R2.put(key, body, { customMetadata })` is the
  whole write.

### Why `pages.updated_at` is the right cache-bust signal

- It is already maintained by `DocSync.onSave` after every snapshot write.
- It is already maintained by `PATCH /workspaces/:wid/pages/:id` for icon,
  cover, position, and parent changes.
- It is monotonic per page within a single SQLite session, which is enough
  for the `?v=` query value.
- It avoids the R2 garbage problem the user called out: there is one R2
  object per page that gets overwritten, never `sites/.../<revision_hash>.html`
  accumulating dead entries.

### Why D1 runs before cache

Unpublish, archive, move-out-of-published-tree, slug change, and home page
change must take effect immediately for the next visitor. Stale Cache API
entries and stale R2 objects are tolerated only when the D1 row says the
page is still reachable. Resolution always runs first; cache lookup is for
the body, not for authorization.

## Asset Gating

Public asset path: `GET /_assets/<pageId>/<uploadId>`.

Authorization sequence:

1. Site host resolves to a row in `workspace_sites` with `published_at IS NOT NULL`.
2. `pageId` passes the published-set CTE for that site.
3. `uploads.id = <uploadId>` exists.
4. `uploads.workspace_id = workspace_sites.workspace_id`.
5. `uploads.page_id = <pageId>`.
6. `R2.get(uploads.r2_key)` returns an object.

If any step fails: 404. No 401, no 403; existence must not leak across
sites or across pages.

Cache headers: `Cache-Control: public, max-age=300, must-revalidate`. The
existing canonical `/uploads/:id` route uses `private, max-age=300,
must-revalidate` for page-scoped assets, which is the same TTL with a
private cacheability. Sites can use `public` because the gate already enforces
publication.

Known footgun: when a member copy-pastes an image block from page A to page
B, the underlying `uploads.page_id` still points to A. On Sites, the image
will 404 from B's URL because step 5 fails. v1 ships this as documented
behavior; a real fix requires re-uploading or a "site-eligible upload"
relationship that is out of scope.

## Entry-Point Dispatch

Modify `src/worker/lib/http-entry.ts::handleHttpRequest` to check the site
host BEFORE any path-prefix dispatch. The new branch must:

- own all paths under a site host, including `/` (home page),
  `/<slug>-<id>` (pages), `/_assets/...` (assets), `/robots.txt`, and any
  other future site-owned paths,
- return 404 for any unknown path under a site host, NOT fall through to
  `/api/...` or ASSETS,
- handle `HEAD` requests through the site router, not the asset handler,
- not interfere with `bland.tools`, `docs.limic.dev`, or any other Worker
  custom domain currently registered in `wrangler.jsonc`.

Sketch:

```ts
export async function handleHttpRequest(request, env, ctx, deps) {
  const url = new URL(request.url);
  const siteHost = matchSiteHost(url, env);

  if (siteHost.kind !== "none") {
    return deps.handleSiteRequest(request, env, ctx, siteHost);
  }

  // existing path-based dispatch unchanged
  if (url.pathname.startsWith("/parties/")) { ... }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) { ... }
  // file extension fast path, SPA shell, etc.
}
```

`handleSiteRequest` is a new function exported from `src/worker/sites/` and
wired through the existing `src/worker/index.ts::fetch` `HttpEntryDeps`.

## Entitlements

New file `src/shared/entitlements/site-publishing.ts`:

```ts
import type { ResolvedWorkspaceRole } from "@/shared/entitlements/common";

export interface SitePublishingEntitlements {
  manageSite: boolean;
  publishPage: boolean;
  unpublishPage: boolean;
  setHomePage: boolean;
  changeSlug: boolean;
}

const TABLE: Record<ResolvedWorkspaceRole, SitePublishingEntitlements> = {
  owner: { manageSite: true, publishPage: true, unpublishPage: true, setHomePage: true, changeSlug: true },
  admin: { manageSite: true, publishPage: true, unpublishPage: true, setHomePage: true, changeSlug: true },
  member: { manageSite: false, publishPage: false, unpublishPage: false, setHomePage: false, changeSlug: false },
  guest: { manageSite: false, publishPage: false, unpublishPage: false, setHomePage: false, changeSlug: false },
  none: { manageSite: false, publishPage: false, unpublishPage: false, setHomePage: false, changeSlug: false },
};

export function getSitePublishingEntitlements(role: ResolvedWorkspaceRole): SitePublishingEntitlements {
  return TABLE[role];
}
```

Export from `src/shared/entitlements/index.ts`. Worker routes consume it for
authorization; client surfaces consume it for affordance gating.

## Slug Validation

New `sitesSlug` validator in `src/shared/types.ts`, parallel to
`workspaceSlug`:

```ts
const SITE_RESERVED_SLUGS = new Set([
  // app routes / DNS-conflicting labels
  "www",
  "mail",
  "api",
  "cdn",
  "assets",
  "static",
  "admin",
  "app",
  "help",
  "support",
  "security",
  "legal",
  "site",
  "sites",
  // bland-specific
  "bland",
  "docs",
  "status",
  "blog",
]);

const sitesSlug = z
  .string()
  .min(1)
  .max(63) // DNS label upper bound
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "Slug must be lowercase alphanumeric with hyphens; cannot start or end with a hyphen",
  )
  .refine((s) => !SITE_RESERVED_SLUGS.has(s), "This slug is reserved");
```

Site slug uniqueness is checked at the route layer against
`workspace_sites.slug`. The workspace's own `workspaces.slug` is unrelated
and stays valid; a workspace can have one slug for its app URL and a
different slug for its site URL. The backfill default is `workspaces.slug`
but the user can change either independently afterwards.

## Site Shell

The site shell is a thin Worker-side React component that mirrors the visual
structure of `SharePageView` minus the sidebar and breadcrumb. It must NOT
import any client-only module, React node view, or live editor component.

The shell composes:

- `<head>`: `<title>` from page title, `<meta name="description">` from the
  first non-empty paragraph's plain text (truncated to ~155 chars),
  `<link rel="canonical" href="<absolute canonical URL>">`,
  `<meta property="og:type" content="article">`,
  `<meta property="og:title" content="<page title>">`,
  `<meta property="og:url" content="<absolute canonical URL>">`,
  `<meta property="og:image" content="<absolute /_assets URL>">` only when
  `cover_url` is a real `/uploads/<uploadId>` path and the underlying upload
  is gated correctly. Gradient covers are skipped for og:image.
- `<body>`: container, cover (if any) via the same image element used by
  Share view but with rewritten src, emoji icon if `pages.icon` is set,
  H1 title, and the rendered Tiptap output.
- No sidebar, no breadcrumb, no footer (or a minimal footer with "Published
  with bland" and a link to bland.tools is acceptable).
- The shell does NOT inject `__BLAND_PUBLIC_CONFIG__` or any CSP nonce. The
  Sites surface is intentionally script-less in v1.

### Why no scripts in v1

Static HTML keeps the Sites surface bot-friendly, accessible, and cheap to
cache. The first round of use cases (blogs, docs) needs no client interaction
beyond browser link navigation. Selection-aware editor affordances, AI
suggestions, comments, and live presence are deliberately not part of Sites.

## Workspace UI

Workspace settings gets a new "Site" panel (members see read-only, owner/admin
see editable):

- Site URL preview: `https://<slug>.bland.site` (or the configured base
  domain in local dev).
- Slug input with live validation; calls
  `GET /workspaces/:wid/site/slug-availability?slug=...`.
- "Publish site" toggle that calls `PATCH /workspaces/:wid/site` with
  `published: true | false`.
- "Set as home page" picker over the published-set list. Empty list disables
  the picker. Setting home page to null is allowed and explicitly causes the
  root URL to 404 (the brief).
- Disabled if `PUBLISHED_SITE_DOMAIN` is unset in the runtime env: the panel
  shows a single "Sites are not enabled on this instance" message and hides
  the controls.

Per-page surface (page actions menu):

- "Publish to site" / "Stop publishing" with copy clarifying that subpages
  are implicitly published. The action calls
  `POST/DELETE /workspaces/:wid/site/pages/:id`.
- A small "Published" badge near the page title with a "Copy public URL"
  affordance.
- Gated through the new entitlement; non-owner/admin users see the badge
  but not the publish controls. Members can still move their pages under a
  published ancestor; this remains acceptable per the user's brief.

## Environment

Add `PUBLISHED_SITE_DOMAIN` everywhere env types are surfaced:

- `.dev.vars.example`: set to `bland.localhost` so local dev resolves
  `sup.bland.localhost` and `bland.localhost` straight away.
- `wrangler.jsonc`: add `"PUBLISHED_SITE_DOMAIN": ""` to `vars` (empty means
  feature disabled). Production override sets it to `bland.site` once DNS is
  ready.
- Regenerate `worker-configuration.d.ts`.

When `PUBLISHED_SITE_DOMAIN` is unset:

- `matchSiteHost` always returns `kind: "none"`, so the site host branch is
  never taken.
- Site management API routes return 404. The feature is off end to end.

Local-host hint: Chrome resolves `*.localhost` to 127.0.0.1 automatically;
Firefox and Safari may need `/etc/hosts` entries for the specific subdomains
under test. The Playwright E2E harness can set
`BLAND_E2E_PUBLISHED_SITE_DOMAIN=bland.localhost` and use a per-test slug.

## Open Product Questions

These do not block the first build but should be answered before promoting
Sites to GA:

- Apex behavior: redirect to `bland.tools`, render a directory of public
  sites, or stay as a "bland." placeholder? Each has separate moderation,
  privacy, and SEO implications.
- Whether sitemap.xml and noindex defaults should be wired up before public
  launch. v1 ships robots `Allow: /`; some users may want noindex by default
  with an opt-in.
- Whether site-scoped 404 pages should be customizable.
- Whether `home_page_id` deletion should auto-clear (FK is already `SET NULL`)
  or whether the UI should require explicit confirmation.
- Whether image uploads should be re-anchored to the destination page when an
  image block is copied across pages. v1 leaves this as documented breakage.
- Whether unpublishing should optionally purge R2 immediately or rely on
  resolver-first to never serve stale content.

## Phased Plan

### Phase 0: invariants

- This document.
- New types in `src/shared/types.ts`: `WorkspaceSite`, `PublishedPage`,
  request/response shapes for site management.
- New entitlement module skeleton.
- `PUBLISHED_SITE_DOMAIN` added to `.dev.vars.example`, `wrangler.jsonc`,
  `worker-configuration.d.ts`.

### Phase 1: data + management API

- Drizzle schema additions: `workspace_sites`, `published_pages`.
- Workspace creation backfills one `workspace_sites` row.
- Workspace deletion route includes the two new tables in its cleanup batch
  (before deleting `pages` and `workspaces`).
- `src/worker/routes/sites.ts` (canonical-host site management routes).
- Slug validator + reserved set.
- Focused Vitest coverage for entitlements, slug rules, and route
  authorization.

### Phase 2: published-set CTE and Worker render

- New `src/worker/lib/published-pages.ts` exporting `resolveSiteHost`,
  `resolvePublishedPage`, and the batch mention resolver.
- New `src/worker/sites/router.ts` that owns site-host paths (`/`,
  `/<slug>-<id>`, `/_assets/<pageId>/<uploadId>`, `/robots.txt`).
- New `handleSiteRequest` wired into `handleHttpRequest` before path-prefix
  dispatch.
- New `src/worker/sites/render.ts` that owns the snapshot fetch, Yjs
  projection, JSON pre-walk (mention + image src), static renderer call, and
  site shell wrapping.
- New `src/worker/sites/cache.ts` for normalized cache keys and R2 metadata
  helpers.
- Worker-runtime tests for the resolver, the renderer end to end with a
  fixture snapshot, and the asset gate.

### Phase 3: client UI

- Site panel in workspace settings.
- Page-action affordances for publish/unpublish and "Copy public URL".
- E2E for: enable site -> publish a page -> visit public URL -> mention
  resolves -> change title -> revisit triggers re-render -> unpublish -> 404. Playwright can hit `*.bland.localhost` directly without DNS surgery.

### Phase 4: polish

- robots.txt, basic OG meta, canonical link.
- Optional Cache-Tag when purge tooling lands.
- Decide and implement apex behavior.

## Interaction With Agent-Readiness

Sites must not regress
[agent-ready-plan.md](./agent-ready-plan.md). Specifically:

- The Yjs projection pipeline used by the renderer (snapshot -> Y.Doc ->
  ProseMirror Node) should live as a pure helper in
  `src/worker/sites/render.ts` or `src/worker/lib/yjs-projection.ts`, NOT
  inside DocSync. Agent-ready Phase 1.2 proposes a `getStructuredContent`
  RPC; that should reuse the same helper so the Worker can serve both Sites
  HTML and agent-structured JSON from one projection implementation.
- The headless schema boundary in `src/shared/editor/schema/` is shared.
  Sites must continue to consume `createHeadlessEditorExtensions()` and must
  not import client editor modules.
- The Worker-side projection failure mode for Sites matches the agent-ready
  plan: schema reconstruction failure should NOT fall back to the default
  ProseMirror schema. v1 Sites returns a 500 in that case; agent-ready
  returns a structured error.
- Top-level block `bid` attrs are preserved by the static renderer via
  `bidAttribute(bid)`. Sites benefit from this for future anchored linking
  (`#bid-...`) without committing to it in v1.

## Future Work: Custom Domains (Cloudflare for SaaS)

Out of scope for v1, listed here so the data model leaves room:

- Adding a `custom_domains` table with `(workspace_id, host)` is additive.
- `matchSiteHost` would gain a `kind: "custom"` branch that resolves through
  this table instead of the subdomain slug.
- Cloudflare's SSL for SaaS API handles certificate provisioning; Worker
  routing for custom hostnames is configured via `dispatch_namespaces` or
  zone-level routes. Neither change requires touching the published-set CTE.
- All v1 invariants (slug-neutral R2 body, host-injected head tags,
  publish-set CTE, asset gate) survive the addition of custom hosts.

## Validation Plan

### Unit (shared)

- Slug validator round-trips and rejects reserved set.
- `getSitePublishingEntitlements` returns the expected map per role.
- Mention pre-resolution drops unreachable pageIds before reaching the
  static renderer.
- Image src rewriter handles `/uploads/<id>` paths and ignores absolute URLs
  or already-rewritten `/_assets/...` paths.

### Worker runtime

- `matchSiteHost` for `bland.localhost`, `sup.bland.localhost`,
  `bland.site`, `sup.bland.site`, `bland.tools`, unset env.
- Published-set CTE returns the nearest ancestor row, respects `archived_at`
  filtering, and respects MAX_TREE_DEPTH.
- Site management routes enforce role-based 403/404.
- `GET /` renders the home page or 404s consistently with the CTE.
- Slug canonicalization 308s correctly and preserves query string.
- Asset gate fails closed for: mismatched workspace, mismatched page,
  unpublished page, missing R2 object.
- Render pipeline produces the expected HTML against a fixture Yjs
  snapshot, including a mention to an unpublished sibling rendered as
  restricted.
- Cache-key normalization strips visitor query params and adds `?v=...`.
- R2 customMetadata round-trip detects stale objects and triggers
  re-render.
- The site host branch in `handleHttpRequest` does not affect requests on
  `bland.tools` or `docs.limic.dev`.

### E2E

- Create a workspace, publish a page tree, visit `<slug>.bland.localhost/`,
  see the home page, follow a mention link to a published sibling, follow a
  mention back to an unpublished sibling and observe the restricted-mention
  rendering, change a title and reload to see canonical slug 308, unpublish
  the root and observe site-wide 404.
- Assets: published page with an image renders the image successfully;
  same image on an unpublished or different page 404s.
- Disabled site: `PUBLISHED_SITE_DOMAIN` unset causes both public and
  management surfaces to behave as if Sites does not exist.

## Recommended First Milestone

1. Land Phase 0 and Phase 1 in a single PR: schema, types, entitlements,
   management API, slug validator, env wiring. No public surface yet.
2. Then Phase 2 in a second PR: published-set resolver, render pipeline,
   site router, host dispatch, Cache API + R2 wiring, asset gate. Public
   surface is live behind the env flag.
3. Phase 3 client UI in a third PR.
4. Phase 4 polish and apex decision separately.

This is the smallest credible path that ships the feature behind an env
flag, keeps DocSync untouched, and leaves room for both the agent-ready
plan and custom-domain follow-on work.
