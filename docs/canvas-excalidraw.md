# Canvas Page Kind (Excalidraw) — Stage 1

Date: 2026-04-19

## Pressure-Test Revisions (2026-04-19)

This doc was revised after a pressure test surfaced four concrete issues:

- The Y.Array-based element store was invalid — Yjs forbids moving an
  already-integrated shared type, so reordering by delete + re-insert of the
  same `Y.Map` throws at runtime. Canvas elements are now stored in a
  `Y.Map<Y.Map>` keyed by element id, with z-order derived from each
  element's own `index` (fractional) field. Reorders mutate that field
  instead of moving map entries. See [Yjs document shape](#yjs-document-shape)
  and [`ExcalidrawBinding`](#excalidrawbinding).
- `kind` threading was under-specified. `ActivePageSnapshot` is a
  hand-picked projection, and shared-root pages seed through
  `GET /share/:token` + `ShareRootPage` without ever calling the live page
  fetch. Both surfaces are enumerated explicitly in
  [Data model](#data-model) now, including the share endpoint and seed
  shape.
- The page-view shell hard-codes a document-column layout (max ~48rem +
  an outline rail). Rather than branching the shell, canvas pages
  render **inside the existing document column by default** and expose
  an **Expand** toggle as an overlay on the canvas surface itself (not
  in the page-view header — a header-slot button would disappear when
  the canvas goes full-viewport, forcing a duplicate copy inside the
  expanded portal). Expanded state is per-viewer viewport preference
  (local `useState`, not Yjs). This keeps the shared shell and the
  page-view header untouched for stage 1. See [Client: canvas
  pane](#client-canvas-pane).
- The image flow had a race (repeated `onChange` could double-presign the
  same `fileId` mid-upload), wrong auth for cold-start fetches (GET
  `/uploads/:id` uses the refresh cookie via `credentials: "include"` or
  `?share=`, not a bearer token), and a helper-signature mismatch
  (`uploadFile` takes a `File`, not a `Blob`). All three are fixed in
  [Image assets](#image-assets-r2).

## Context

bland currently has exactly one page kind: a Tiptap document synced through a
DocSync Durable Object over Yjs. This feature adds a second, full-page kind —
**canvas** — backed by `@excalidraw/excalidraw` and the same DocSync transport.

Stage 1 scope: whole-page canvas only. A page is either a `doc` or a `canvas`,
chosen at creation time. Stage 2 (**deferred**) adds an Excalidraw-as-block
embed inside doc pages.

This spec is the implementation handoff. It is grounded in the live tree as of
`main` at commit `902308e`. It reuses existing DocSync, permissions, share, and
R2 upload infrastructure wherever possible. It does not introduce new Worker
runtimes, new auth paths, or new wire protocols.

### Relevant source

- [src/worker/db/d1/schema.ts](../src/worker/db/d1/schema.ts)
- [src/shared/types.ts](../src/shared/types.ts)
- [src/shared/constants.ts](../src/shared/constants.ts)
- [src/shared/doc-messages.ts](../src/shared/doc-messages.ts)
- [src/worker/routes/pages.ts](../src/worker/routes/pages.ts)
- [src/worker/routes/uploads.ts](../src/worker/routes/uploads.ts)
- [src/worker/durable-objects/doc-sync.ts](../src/worker/durable-objects/doc-sync.ts)
- [src/worker/lib/yjs-text.ts](../src/worker/lib/yjs-text.ts)
- [src/worker/queues/search-indexer.ts](../src/worker/queues/search-indexer.ts)
- [src/client/lib/api.ts](../src/client/lib/api.ts)
- [src/client/lib/uploads.ts](../src/client/lib/uploads.ts)
- [src/client/components/workspace/page-view.tsx](../src/client/components/workspace/page-view.tsx)
- [src/client/components/share/page-view.tsx](../src/client/components/share/page-view.tsx)
- [src/client/components/active-page/provider.tsx](../src/client/components/active-page/provider.tsx)
- [src/client/components/editor/editor-pane.tsx](../src/client/components/editor/editor-pane.tsx)
- [src/client/components/editor/use-editor-session.ts](../src/client/components/editor/use-editor-session.ts)

### External references

- Excalidraw package docs: <https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation>
- Excalidraw component props: <https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props>
- Excalidraw 0.18 types (`ExcalidrawElement`, `AppState`, `BinaryFiles`): <https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/types.ts>
- Collaboration / reconciler blog: <https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature>
- `y-excalidraw` reference binding: <https://github.com/RahulBadenkal/y-excalidraw>
- Image rendering constraint (must be dataURL, not remote URL): <https://github.com/excalidraw/excalidraw/issues/9491>

## Goals

- Add a `canvas` page kind that renders Excalidraw instead of Tiptap.
- Collaborate over the existing DocSync Durable Object using Yjs.
- Persist image assets through the existing `/uploads` presign + PUT + GET flow
  in R2.
- Keep the surrounding page chrome identical: title, icon, cover, breadcrumbs,
  byline, avatar stack, sync dot, share dialog.
- Reuse existing permissions, affordance, active-page, and share-view wiring.
  No new auth paths.
- Make canvas pages searchable through the same FTS index as doc pages.

## Non-Goals

- Canvas as an inline block inside a doc page. Deferred to stage 2.
- Converting an existing doc to a canvas (or vice versa). A page's `kind` is
  immutable after creation in stage 1.
- Server-side rendering or export of canvases (PNG/SVG generation from the
  Worker). Client-side export via Excalidraw's built-ins is available to users;
  Worker-side export is not.
- Offline-first editing parity for canvases. IndexedDB snapshot caching is
  included, but the PWA offline story for canvases is not specifically tuned
  beyond what DocSync already provides.
- Collaborative undo across peers. Stage 1 uses Excalidraw's built-in local
  history; cross-peer undo is deferred.
- Per-element field-level CRDT merges. Stage 1 reconciles at the element
  granularity using Excalidraw's own `version`/`versionNonce` rule, matching
  upstream semantics.

## Decision Summary

- Add a `kind` column to `pages` with enum `("doc" | "canvas")` and
  default `"doc"`.
- Thread `kind` through `Page`, `CreatePageRequest`, worker routes, client
  API, and the active-page snapshot.
- Branch rendering in `workspace/page-view.tsx` and `share/page-view.tsx` on
  `snapshot.kind`: `doc` → existing `EditorPane`, `canvas` → new `CanvasPane`.
- Reuse the existing DocSync DO unchanged at the transport level. Canvas pages
  get their own DO instance per `pageId`, the same as doc pages.
- Use Yjs for canvas state with three new root keys alongside the existing
  `page-title`. Do not reuse `document-store`; canvases do not share that
  fragment.
- Write a bland-authored element binding (~200 LOC) that mirrors Excalidraw's
  `version`/`versionNonce` reconciliation. Do not add `y-excalidraw` as a
  dependency; it is lightly maintained and ships stale types.
- Override Excalidraw's `generateIdForFile` to use a SHA-256 of the file bytes
  as the Excalidraw `fileId`. Upload the bytes to R2 via the existing presign
  flow and record the `fileId → uploadId` mapping inside the Yjs doc.
- On cold start, fetch R2 blobs for each referenced upload, convert to dataURL
  client-side, and register via `excalidrawAPI.addFiles` before the first
  `updateScene`. Excalidraw does not accept remote URLs; this is a hard
  upstream constraint.
- Extend search indexing: branch `getIndexPayload` on kind and extract text
  from canvas elements in a new `extractCanvasPlaintext` helper.
- Make share-link viewers of a canvas see `viewModeEnabled` + a locked-down
  `UIOptions`.
- Lazy-load the Excalidraw component bundle to avoid regressing first paint
  for the default doc case.

## Data Model

### D1 schema change

Add to `src/worker/db/d1/schema.ts` in the `pages` table:

```ts
kind: text("kind", { enum: ["doc", "canvas"] })
  .notNull()
  .default("doc"),
```

Ship a drizzle migration that adds the column with default `"doc"`. All existing
rows get `"doc"` automatically. Do not hand-edit the generated SQL except to
verify the default is applied to existing rows by SQLite's `ALTER TABLE`
semantics. If SQLite cannot apply a NOT NULL default retroactively in a single
step, write a hand-rolled two-step migration (add nullable, backfill, add NOT
NULL) and commit both the schema change and the SQL.

### Shared types

Update `src/shared/types.ts`:

```ts
export const PageKind = z.enum(["doc", "canvas"]);
export type PageKind = z.infer<typeof PageKind>;

export const Page = z.object({
  id: z.string(),
  workspace_id: z.string(),
  parent_id: z.string().nullable(),
  kind: PageKind, // NEW
  title: z.string(),
  icon: z.string().nullable(),
  cover_url: z.string().nullable(),
  position: z.number(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

export const CreatePageRequest = z.object({
  kind: PageKind.default("doc"), // NEW
  title: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  parent_id: z.string().max(26).optional().nullable(),
  position: z.number().optional(),
});
```

`UpdatePageRequest` stays as-is — `kind` is not mutable in stage 1. The server
should reject any request that attempts to set `kind`.

### Shared constants

Add to `src/shared/constants.ts`:

```ts
export const YJS_CANVAS_ELEMENTS = "canvas-elements"; // Y.Map<Y.Map<unknown>> — keyed by element id
export const YJS_CANVAS_APP_STATE = "canvas-app-state"; // Y.Map<unknown>
export const YJS_CANVAS_FILE_REFS = "canvas-file-refs"; // Y.Map<string> — fileId → uploadId
```

### `kind` threading — every surface

`ActivePageSnapshot` is a **hand-picked projection** in
`src/client/lib/active-page-model.ts`, not a direct serialisation of `Page`.
Shared-root pages are seeded from share-link resolution
(`src/client/components/active-page/shared.tsx`) and skip the live page fetch
entirely, so propagating `kind` through only the live path leaves shared-root
canvases misclassified as docs. Every surface below must explicitly carry
`kind`:

1. **`ActivePageSnapshot`** (`src/client/lib/active-page-model.ts`) — add
   `kind: PageKind`.
2. **`snapshotFromPage()`** (`src/client/components/active-page/provider.tsx`)
   — copy `page.kind` into the snapshot. The `Pick<Page, ...>` parameter
   type needs `"kind"` added.
3. **`ActivePageSeed`** (also in `provider.tsx`) — add `kind: PageKind`. The
   seed is how shared-root pages reach the provider without a live fetch.
4. **`seedToReadyState()`** — carry `seed.kind` into the snapshot.
5. **`ShareRootPage`** (`src/client/components/share/use-share-view.ts`) —
   add `kind: PageKind`. This is the client-side contract for the share
   endpoint.
6. **`GET /share/:token`** response (`src/worker/routes/shares.ts` — the
   handler currently returns `page_id, workspace_id, title, icon, cover_url,
permission, token, viewer`). Add `kind`.
7. **`SharedActivePageBoundary`** (`shared.tsx`) — include `kind:
rootPage.kind` when constructing the seed that is passed to
   `ActivePageProvider`.
8. **IndexedDB cached page meta** — if the cache stores `Page` rows
   verbatim, the new column flows through automatically. If the cache uses a
   projected shape, extend it. Treat an absent `kind` on an already-cached
   entry as `"doc"` (backwards compat with pre-migration caches).
9. **`GET /workspaces/:wid/pages` + `GET /workspaces/:wid/pages/:pid`** in
   `src/worker/routes/pages.ts` — verify the select columns include `kind`
   and the response includes it (adding it to the `Page` zod schema does
   not automatically pick it up if the select list is explicit).
10. **`deriveWorkspacePageAffordance` / `deriveSharePageAffordance`** in
    `src/client/lib/affordance/` — accept `kind` so the derived affordance
    bag can populate either an `editor` slot or a `canvas` slot (see
    [Open questions](#open-questions)).

Missing any one of these leaves a hole where a canvas page renders as a
doc (or vice versa). Add explicit tests for each — at minimum, one E2E
for a shared-root canvas that asserts the canvas surface mounts
without a live-page fetch.

### Worker route changes

- `POST /workspaces/:wid/pages` — accept `kind`, persist it to the row. Reject
  `kind !== "doc"` from non-member callers if any share-token-authed code path
  reaches this route (there should not be one, but verify).
- `GET /workspaces/:wid/pages` and `GET /workspaces/:wid/pages/:pid` — include
  `kind` in the response. The `Page` type change propagates automatically
  through the zod codec, but verify the select column lists in
  `src/worker/routes/pages.ts` include the new column.
- `PATCH /workspaces/:wid/pages/:pid` — verify the zod schema rejects `kind`.

### Client API

`src/client/lib/api.ts`:

```ts
pages: {
  create: async (
    workspaceId: string,
    data: { kind?: PageKind; title?: string; parent_id?: string; icon?: string },
  ) => { ... },
}
```

Default `kind` to `"doc"` at the callsite where "New page" is invoked from the
sidebar. The canvas creation path (see [Creation UX](#creation-ux)) passes
`kind: "canvas"` explicitly.

## Yjs Document Shape

A canvas page's Yjs doc has four root types. The title stays in the same place
as doc pages so the surrounding PageTitle component is reused as-is.

| Key                | Type                    | Purpose                                                             |
| ------------------ | ----------------------- | ------------------------------------------------------------------- |
| `page-title`       | `Y.Text`                | Page title. Same as doc pages. Reused by chrome.                    |
| `canvas-elements`  | `Y.Map<Y.Map<unknown>>` | Keyed by Excalidraw element id. Order derived from `element.index`. |
| `canvas-app-state` | `Y.Map<unknown>`        | Persistent subset of Excalidraw `AppState`.                         |
| `canvas-file-refs` | `Y.Map<string>`         | `fileId → uploadId` for images stored in R2.                        |

`document-store` (the Tiptap XmlFragment) is never touched on canvas pages.
It will exist as an empty fragment if any client code ever calls
`ydoc.getXmlFragment("document-store")` on a canvas doc, which should not
happen. `extractPlaintext` must not run on a canvas doc (see
[Search indexing](#search-indexing)).

### Why a map keyed by id, not an array

A `Y.Array` would seem natural because Excalidraw elements have a stable
z-order. It is a trap: **Yjs forbids moving an already-integrated shared
type**, so the naïve "delete at index `i`, re-insert at index `j`" pattern
throws at runtime on the second integration (verified locally against
`yjs@13.6.30`). Cloning the inner `Y.Map` on every reorder would work but
loses element identity and doubles the CRDT bookkeeping per drag.

Instead:

- `canvas-elements` is a `Y.Map<Y.Map<unknown>>` keyed by the Excalidraw
  element id (`el.id`).
- Z-order comes from Excalidraw's own `element.index` field — a fractional
  index string, introduced in 0.18 precisely to support order-agnostic
  storage.
- On read, the binding walks map entries, materialises plain JSON, and
  sorts by `element.index` before calling `updateScene`.
- On reorder, the binding only **mutates `element.index`** on the affected
  inner `Y.Map` — no entry movement, no Yjs shared-type reparent, no
  throws.
- Inserts `set(id, newYMap)`. Deletes set `element.isDeleted = true` on
  the inner map (tombstone) and keep the entry.

Stage 1 stores the entire element payload as a single `element` value on
the inner `Y.Map` (not split by field). Rationale: Excalidraw's own
reconciler operates at element granularity using `version` /
`versionNonce`, so sub-field merges don't buy us correct semantics — they
just diverge from upstream. If a future merge-rich collaboration story
requires per-field CRDT granularity, the binding surface is the right
place to revisit.

### Element payload shape

Each inner `Y.Map` in `canvas-elements` stores a single `element` entry:

```ts
// outer: Y.Map<Y.Map<unknown>>, keyed by el.id
// inner Y.Map, one entry:
{
  element: ExcalidrawElement, // full element JSON; includes `id`, `index`,
                              // `version`, `versionNonce`, `isDeleted`, etc.
}
```

The element id is both the outer map key and `element.id` — they must stay
in sync. The binding treats the outer key as authoritative.

Deletions are tombstones: set `element.isDeleted = true` and keep the
entry. Garbage-collect tombstones older than 30 days in a later milestone;
do not tackle in stage 1.

### AppState subset

Persist only these fields in `canvas-app-state`:

```
viewBackgroundColor
currentItemStrokeColor
currentItemBackgroundColor
currentItemFillStyle
currentItemStrokeWidth
currentItemStrokeStyle
currentItemRoughness
currentItemOpacity
currentItemFontFamily
currentItemFontSize
currentItemTextAlign
currentItemStartArrowhead
currentItemEndArrowhead
gridSize
gridModeEnabled
```

Do **not** persist: `selectedElementIds`, `editingElement`, `cursorButton`,
`draggingElement`, `resizingElement`, `contextMenu`, `openDialog`,
`activeTool`, `collaborators`, `pasteDialog`, `showStats`, `scrollX`,
`scrollY`, `zoom`. Viewport is per-client state.

## DocSync Durable Object

### No transport or auth changes

DocSync is already kind-agnostic for transport:

- Storage is chunked binary Yjs snapshots keyed by `pageId` — doc-shape
  agnostic.
- WebSocket auth in `src/worker/index.ts` (`onBeforeConnect`) validates JWT
  or share-link token, resolves access via `resolvePageAccessLevels()`,
  and sets the `readOnly` URL param. Canvas pages reuse this verbatim.
- Custom JSON message types (`page-metadata-refresh`,
  `page-metadata-updated`) remain identical; canvas pages emit and consume
  them the same way doc pages do.

No changes to `onBeforeConnect`, `getConnectionTags`, or the WebSocket wire
protocol.

### `onSave` title sync

The existing `onSave()` reads `ydoc.getText(YJS_PAGE_TITLE)` and mirrors to
D1. Canvas pages store their title in the same place, so this works unchanged.

### Indexing

`getIndexPayload(pageId)` currently calls `extractPlaintext(ydoc)` which walks
the `document-store` XmlFragment. For a canvas doc that fragment is empty, so
only the title would be indexed. That is wrong.

Two changes:

1. `getIndexPayload(pageId, kind)` accepts the page kind as an argument. The
   queue consumer (`src/worker/queues/search-indexer.ts`) already fetches the
   page row to route to `WorkspaceIndexer`; adding `kind` to that select is
   free.

2. Add `extractCanvasPlaintext(ydoc)` to `src/worker/lib/yjs-text.ts`:

   ```ts
   export function extractCanvasPlaintext(ydoc: Y.Doc): { title: string; bodyText: string } {
     const title = ydoc.getText(YJS_PAGE_TITLE).toString();
     const elements = ydoc.getMap<Y.Map<unknown>>(YJS_CANVAS_ELEMENTS);
     const parts: string[] = [];
     elements.forEach((entry) => {
       const el = entry.get("element") as ExcalidrawElementLike | undefined;
       if (!el || el.isDeleted) return;
       if (el.type === "text" && typeof el.text === "string" && el.text.trim()) {
         parts.push(el.text.trim());
       } else if (el.type === "frame" && typeof el.name === "string" && el.name.trim()) {
         parts.push(el.name.trim());
       }
     });
     return { title: title.trim() || DEFAULT_PAGE_TITLE, bodyText: parts.join(" ") };
   }
   ```

   `ExcalidrawElementLike` is a structural type with only the fields used
   here, defined locally to avoid pulling Excalidraw types into the Worker
   bundle.

3. `DocSync.getIndexPayload` branches:

   ```ts
   async getIndexPayload(
     pageId: string,
     kind: PageKind,
   ): Promise<{ kind: "found"; title: string; bodyText: string } | { kind: "missing" }> {
     // ... reassemble chunks, apply update, create Y.Doc ...
     const { title, bodyText } =
       kind === "canvas" ? extractCanvasPlaintext(ydoc) : extractPlaintext(ydoc);
     return { kind: "found", title, bodyText };
   }
   ```

### Connection cap

The existing `MAX_CONNECTIONS_PER_DOC = 20` cap applies to canvases as well.
Canvas pages are not expected to blow this budget in stage 1.

## Client: Canvas Pane

### Route-level branch

`src/client/components/workspace/page-view.tsx` currently mounts
`<EditorPane>` unconditionally inside `CanonicalActivePageBoundary`. Branch
on `snapshot.kind`:

```tsx
{
  page.kind === "canvas" ? (
    <CanvasPane
      pageId={page.id}
      initialTitle={page.title}
      onTitleChange={handleTitleChange}
      onProvider={setSyncProvider}
      workspaceId={effectiveWorkspaceId}
      affordance={pageAffordance?.canvas ?? { canEdit: false, canInsertImages: false }}
      resolveIdentity={resolveIdentity}
    />
  ) : (
    <EditorPane
      pageId={page.id}
      initialTitle={page.title}
      /* ... */
    />
  );
}
```

Do the same in `src/client/components/share/page-view.tsx`, passing the
share-derived affordance.

The page chrome above the pane (breadcrumbs, icon/cover, title text,
share/avatar/sync widgets) is identical — do not branch it. The
`PageTitle` component already works off the Yjs title text that both kinds
share.

### `useCanvasSession` hook

Parallel to `useEditorSession`. Lives at
`src/client/components/canvas/use-canvas-session.ts`. Shape:

```ts
interface CanvasSessionInternalState {
  ydoc: Y.Doc;
  provider: YProvider;
  yElements: Y.Map<Y.Map<unknown>>; // keyed by Excalidraw element id
  yAppState: Y.Map<unknown>;
  yFileRefs: Y.Map<string>;
}

export type CanvasSessionState =
  | ({ kind: "loading" } & CanvasSessionBase)
  | ({ kind: "ready" } & CanvasSessionBase & CanvasSessionInternalState);
```

The hook mirrors the internals of `useEditorSession` (IDB persistence,
YProvider, title observer, title seeding, connect reconciliation via
`reconcileDocSyncProvider`). Keep it parallel rather than extracting a shared
`useDocSyncSession` — stage 1 benefits from explicit ownership, and CLAUDE.md
prefers small duplication over speculative abstraction. Stage 2 (canvas as
block) will likely force the extraction; do it then.

### `CanvasPane` component

Lives at `src/client/components/canvas/canvas-pane.tsx`. Responsibilities:

1. Mount `useCanvasSession` and gate on `session.kind === "ready"`.
2. Render `PageTitle` on top (shared with EditorPane).
3. Lazy-load Excalidraw via `React.lazy` and `Suspense` so the editor bundle
   is not regressed:

   ```tsx
   const Excalidraw = lazy(() => import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })));
   ```

4. Mount `<Excalidraw>` inside a div sized to the available page area.
   Excalidraw takes 100% width/height of its parent, so the container
   must have explicit dimensions. By default, the canvas pane sits
   inside the existing document column (`max-w-3xl` / `lg:max-w-[48rem]`)
   — the same chrome the editor already uses. Give the canvas container
   a concrete height: roughly `min-h-[70vh]` with the outer column
   controlling width.

5. **Expand/collapse is an overlay on the canvas, owned by the pane.**
   Render a small `CanvasExpandToggle` button as a positioned child of
   the canvas container itself — top-right corner, inside the pane,
   not in the page-view header. This is the only placement that works
   in both modes without duplication: a header-slot button would
   disappear when the canvas goes full-viewport, forcing a second copy
   inside the expanded portal. An overlay avoids that and keeps
   ownership clean — the pane owns the state, the button, the portal,
   and the collapse gesture end-to-end. Page-view does nothing
   canvas-specific beyond mounting `CanvasPane` when `snapshot.kind ===
"canvas"`.

   Placement:
   - `position: absolute; top: 0.75rem; right: 0.75rem; z-index: 10;
pointer-events: auto;` inside a relative-positioned canvas
     container.
   - Top-right is collision-free against Excalidraw's default chrome:
     its main toolbar sits top-center, library panel slides from the
     right but below the top bar, zoom + help widgets live in the
     bottom corners.
   - Use a compact icon button (`Maximize2` / `Minimize2` from
     `lucide-react`) to read as "resize" rather than "fullscreen";
     bland already uses lucide icons elsewhere.

   Behaviour:
   - `const [expanded, setExpanded] = useState(false)` lives in
     `CanvasPane`.
   - When `expanded`, the canvas container portals (via `createPortal`
     to `document.body`) and renders as `position: fixed inset-0 z-50
bg-background`. Keep the inner `<Excalidraw>` element identity
     stable across the portal swap so the `excalidrawAPI` handle and
     binding are preserved — use a stable container ref, not a
     re-mount. An alternative is to keep the element in the same
     React subtree and only toggle the fixed-positioning class, which
     avoids the portal entirely; that is simpler but relies on the
     existing DOM ancestors not setting `overflow: hidden` or `contain`
     above the canvas. Verify on first implementation; fall back to the
     portal if clipping bites.
   - Pressing `Escape` collapses. Hook a single
     `useEffect` keydown listener gated on `expanded` to avoid global
     keyboard churn.
   - State does **not** live in Yjs — it's a per-viewer viewport
     preference. Persisted default widths (workspace-wide or per-page)
     are deferred.

   Trade-off accepted: the expand control is off the page-view header
   row, which means it visually separates from the share / avatar /
   sync cluster. That's acceptable because the expand action affects
   only the canvas surface, not the page as a whole — colocating it
   with the canvas is the more honest affordance.

6. Instantiate `ExcalidrawBinding` (see next section) inside a
   `useEffect` that fires once Excalidraw's `excalidrawAPI` callback
   resolves. Destroy the binding in the cleanup. The binding is
   independent of expanded state — it only needs the API, not the
   container size.

7. Forward the sync provider up through `onProvider` so the surrounding
   `AvatarStack` and `SyncStatusDot` work identically to doc pages.

8. Pass `viewModeEnabled` when `!affordance.canEdit`, plus a
   locked-down `UIOptions` for share viewers (see [Share and
   read-only](#share-and-read-only)).

### `ExcalidrawBinding`

A bland-authored class that wires Excalidraw's imperative API to the Yjs
roots. Lives at `src/client/components/canvas/excalidraw-binding.ts`.

Construction:

```ts
class ExcalidrawBinding {
  constructor(
    api: ExcalidrawImperativeAPI,
    ydoc: Y.Doc,
    yElements: Y.Map<Y.Map<unknown>>, // keyed by Excalidraw element id
    yAppState: Y.Map<unknown>,
    yFileRefs: Y.Map<string>,
    awareness: Awareness,
    opts: {
      workspaceId: string;
      pageId: string;
      shareToken?: string;
      canEdit: boolean;
    },
  ) {
    /* wire up observers, return binding */
  }

  handleChange(elements, appState, files): void;
  handlePointerUpdate(payload): void;
  destroy(): void;
}
```

Element sync — local → remote, fired from Excalidraw's `onChange`, wrapped
in `ydoc.transact(fn, binding)` so remote echoes can be filtered by origin:

1. Build a `Map<id, ExcalidrawElement>` from the local `elements` array.
2. For each local element, read the remote inner `Y.Map` via
   `yElements.get(id)` and decide if local wins using Excalidraw's upstream
   rule: local wins if `local.version > remote.version`, or
   `local.version === remote.version && local.versionNonce < remote.versionNonce`.
   - If the id is new, `yElements.set(id, newInnerYMap.set("element",
localEl))`.
   - If local wins, replace the inner entry via
     `remote.set("element", localEl)`.
   - If remote wins or is equal, skip.
3. For each remote id missing locally, **skip**. Remote-only entries may be
   tombstones or other peers' work-in-flight; the remote observer handles
   integration.
4. **Never move entries.** Z-order changes are recorded by updating
   `element.index` on the inner map (step 2 already covers it, since
   `index` lives inside the element payload). Do not attempt to reorder
   the outer `Y.Map`.

Element sync — remote → local, fired from a `yElements` deep observer
filtered by `tx.origin !== binding`:

1. On any observed change, materialise an element array: iterate
   `yElements.values()`, pull `entry.get("element")`, filter
   `!isDeleted` if desired, and sort by `element.index`.
2. Call Excalidraw's exported `reconcileElements(localElements,
remoteElements, appState)` helper to resolve with the upstream algorithm.
   If that helper is not exported stably at 0.18.0, fall back to a local
   reimplementation of the `version` / `versionNonce` tiebreak (~30 lines).
3. Apply with `api.updateScene({ elements: reconciled, captureUpdate:
CaptureUpdateAction.NEVER })`. The `NEVER` flag prevents the remote
   change from entering Excalidraw's local history stack.

Guard against echo loops. Use an `isApplyingRemote` boolean around
`updateScene`; skip the next `onChange` if it matches. Additionally,
`ydoc.transact(fn, binding)` with a unique origin, and filter Y observers
by `tx.origin !== binding` — the standard Yjs echo guard.

AppState sync:

- On local `onChange`, write the persistent subset into `yAppState` via
  `ydoc.transact(() => { ... }, binding)`. Debounce at 250ms to avoid
  spraying typing-induced changes.
- On remote `yAppState` observe, merge into a local React state and pass
  `appState` to `updateScene`.

Awareness / pointer sync: see [Awareness / Presence](#awareness--presence).

Binding `destroy()`: detach all Y observers, clear awareness local state,
clear debounce timers. Do not destroy the `ydoc` — the session hook owns it.

### Undo / redo

Stage 1 uses Excalidraw's built-in local history via `captureUpdate:
CaptureUpdateAction.IMMEDIATELY` on local changes (the default) and
`CaptureUpdateAction.NEVER` on remote-applied changes. Collaborative undo is
deferred.

### Scale target and remote-rebuild coalescing

The remote → local algorithm above rebuilds the full element array on
every observed `yElements` change. That policy is simple and correct but
cost-linear in element count.

**Stage 1 target: up to ~2,000 elements per canvas, up to ~5 concurrent
editors.** Beyond that, the synchronous rebuild path can dominate a
collaborative drag. Empirically (Y.Map → array → sort, isolated from
Excalidraw): ~0.4ms / 1k, ~1.8ms / 10k, ~5.6ms / 20k. Once
`reconcileElements` + `updateScene` layer on top, the 10k+ regime can
miss a 16ms frame budget under sustained remote traffic.

To stay within that target without over-engineering:

1. **Coalesce remote rebuilds via `requestAnimationFrame`.** The
   `yElements` deep observer sets a dirty flag and schedules a single
   rAF callback. The callback, not the observer, performs the
   materialise → sort → `reconcileElements` → `updateScene` work.
   Multiple remote transactions arriving in the same frame collapse to
   one rebuild.

   ```ts
   let dirty = false;
   let rafHandle = 0;
   const scheduleRebuild = () => {
     if (dirty) return;
     dirty = true;
     rafHandle = requestAnimationFrame(() => {
       dirty = false;
       rafHandle = 0;
       applyRemoteRebuild();
     });
   };
   yElements.observeDeep((events, tx) => {
     if (tx.origin === binding) return; // echo guard
     scheduleRebuild();
   });
   // in destroy():
   if (rafHandle) cancelAnimationFrame(rafHandle);
   ```

2. **Skip rebuild when the observed keys match what is already on the
   scene.** Maintain a `lastAppliedVersionMap: Map<id, number>`
   (`el.id → el.version`). After materialising the new array, diff
   against that map; if no id has a newer `version`, skip
   `updateScene`. This catches no-op transactions (tombstone churn,
   awareness-adjacent writes).

3. **Do not optimise further in stage 1.** Per-key incremental patches
   (walk only the events' `changes.keys` and mutate the local scene in
   place) are tempting but require reimplementing Excalidraw's scene
   invariants (bound elements, frame parents, group membership). That
   is a stage-2 concern if the scale target grows.

Local → remote (fired from `onChange`) does **not** need rAF
coalescing — Excalidraw already batches `onChange` at its own cadence,
and the local side is the authoritative source for the outgoing write.
Keep the local write synchronous inside the `onChange` callback so a
slow rAF cycle never makes our own edits appear stale to peers.

Document the scale target in the PR body and in the test plan. If a
real workload starts routinely exceeding 2k elements, revisit the
observer policy before growing the budget.

### IndexedDB persistence and cold start

Reuse `IndexeddbPersistence` from `useEditorSession` semantics. The cached
snapshot persists the canvas offline. On cold start:

1. IDB-synced event fires → `session.kind === "ready"`.
2. `CanvasPane` constructs the binding.
3. Binding iterates `yElements.values()`, materialises elements, sorts by
   `element.index`, and calls `api.updateScene` to hydrate the initial
   scene.
4. WebSocket sync arrives later and merges in via the normal remote
   observer flow.

## Image Assets (R2)

### fileId override

Excalidraw defaults to SHA-1 of the file bytes or `nanoid(40)`. Override with
a stable SHA-256:

```tsx
async function generateIdForFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

<Excalidraw generateIdForFile={generateIdForFile} ... />
```

This gives us deterministic dedup when the same image is dropped twice.

### Upload flow on paste/drop

Excalidraw inlines new images as `BinaryFileData` with a base64 dataURL,
placing a `status: "pending"` image element on the scene.

The binding keeps an **ephemeral `Set<fileId>` of in-flight uploads**
(`pendingUploads`) on the instance. It is not in Yjs — it's per-session
state to de-duplicate concurrent `onChange` bursts.

On `onChange(elements, appState, files)`:

1. Walk `elements` for `type === "image"` with `status === "pending"` and a
   `fileId` present.
2. Skip if **any** of these is true (all three must be checked before
   starting an upload):
   - `yFileRefs.get(fileId)` already has an upload id — durable winner
     from this or another peer.
   - `pendingUploads.has(fileId)` — this tab has an upload in flight for
     the same id.
   - `files[fileId]` is missing — nothing to upload yet; wait for the
     next `onChange` once Excalidraw has materialised the bytes.
3. Add `fileId` to `pendingUploads` **before** awaiting presign. This is
   the de-dup gate.
4. Decode `files[fileId].dataURL` into bytes (base64 → `Uint8Array`) and
   wrap in a `File`: `new File([bytes], \`${fileId}.${ext}\`, { type:
   mimeType })`. `ext` is derived from the MIME type (`image/png`→`png`,
etc.). The existing `uploadFile`helper in`src/client/lib/uploads.ts`expects a`File`and validates`file.name`+`file.type`server-side, so supplying a real`File`
   avoids broadening that helper.
5. Call `uploadFile(workspaceId, file, pageId, shareToken)` — existing
   presign + PUT flow, returns a URL like `/uploads/{uploadId}`.
6. Extract the upload id from the URL. If `yFileRefs.get(fileId)` is
   **still** empty (another peer hasn't set it in the meantime), write
   `yFileRefs.set(fileId, uploadId)` inside `ydoc.transact(fn, binding)`.
   If it is already set, discard the newly-uploaded id (the R2 blob is
   orphaned; deferred GC sweeps it later per CLAUDE.md).
7. Mutate the element's `status` to `"saved"` via `api.updateScene`.
   Keep the dataURL in local `files` for this session; do not strip it.
8. Remove `fileId` from `pendingUploads` in a `finally` block so failed
   uploads can be retried on the next `onChange` burst.

Do not push the dataURL bytes into Yjs. The only durable artifact for an
image is the mapping in `yFileRefs`. This keeps Yjs snapshots small and
sidesteps DocSync's chunked-SQLite limits.

### Upload contract constraints

`src/worker/routes/uploads.ts` accepts `content_type` from
`ALLOWED_UPLOAD_TYPES`. Excalidraw supports image mime types: `image/png`,
`image/jpeg`, `image/svg+xml`, `image/webp`, `image/gif`, and a generic
`application/octet-stream`. Stage 1 restrictions:

- `image/svg+xml` is **not** in `ALLOWED_UPLOAD_TYPES` and will be rejected
  by the server. Filter out SVG drops at the client: if a dropped file is
  `image/svg+xml`, show a toast ("SVG upload is not supported yet") and
  discard. Do not weaken server validation.
- Size cap stays at `MAX_UPLOAD_SIZE` (10MB). Excalidraw inlines large
  images as dataURLs, so a 10MB upload is a 14MB dataURL in memory during
  the upload transition. Acceptable for stage 1.
- Files are bound to `page_id = canvasPageId`, same as doc pages.

### Cold-start hydration

On cold start, the binding iterates `yFileRefs` and needs to materialize
images before Excalidraw can render them. Excalidraw requires a dataURL;
remote URLs do not work (upstream issue
[#9491](https://github.com/excalidraw/excalidraw/issues/9491)).

Flow:

1. Binding reads `yFileRefs` entries after first Y sync.
2. For each `(fileId, uploadId)`, call a new helper
   `fetchUploadAsDataURL(uploadId, shareToken?)` that:
   - `fetch`es `/uploads/{uploadId}` — **the GET route authorises via the
     refresh cookie or `?share=token`, not via a bearer token**. Use
     `credentials: "include"` so the browser sends the `bland_refresh`
     cookie on same-origin. For share viewers, append `?share=${shareToken}`
     to the URL instead. Do not attach an `Authorization` header; the GET
     route ignores it (see `src/worker/routes/uploads.ts` — auth comes from
     `parseCookies(...)` and the `?share=` query).
   - reads the response body as a `Blob`;
   - passes it through `FileReader.readAsDataURL(blob)` to produce a
     `data:${mime};base64,...` string.
3. Batch-call `api.addFiles([...fileDataList])` with the resolved dataURLs
   once per ~5 files (to flush rendering in chunks). Use
   `IntersectionObserver` on the canvas viewport if memory pressure
   becomes a problem; defer that optimisation to a follow-up.

`fetchUploadAsDataURL` belongs in `src/client/lib/uploads.ts` alongside
`uploadFile`. `FileReader.readAsDataURL` is significantly faster than a
hand-rolled base64 encoder for large blobs.

### Live peers joining mid-session

When peer B adds an image after peer A is already loaded, peer A sees a new
`yFileRefs` entry through the Yjs observer. Trigger the same
`fetchUploadAsDataURL → addFiles` flow as cold start, then re-apply scene
elements so Excalidraw re-paints the now-resolved image placeholder.

### Fail-open behavior

If `fetchUploadAsDataURL` fails (403, 404, network), surface a single toast
once per page session ("Some images couldn't be loaded") and leave the image
elements with `status: "error"`. Do not remove the elements — the file ref
may become fetchable later (auth refresh, reconnect). Never delete the
`yFileRefs` entry on the client; that is a server-side GC concern.

## Awareness / Presence

bland's awareness contract (commit `902308e`) is: **never put real member
identities on the wire via awareness**. Only `{ userId | null, clientId }`
is published; names and avatars resolve client-side through
`ResolveIdentity`.

Extend that contract for canvases. Publish:

```ts
awareness.setLocalStateField("user", { userId });
awareness.setLocalStateField("pointer", {
  x: pointer.x,
  y: pointer.y,
  tool: "pointer" | "laser",
});
awareness.setLocalStateField("button", "up" | "down");
awareness.setLocalStateField("selectedElementIds", appState.selectedElementIds);
```

Drive the `collaborators` prop on `<Excalidraw>` from the awareness map:

```ts
const collaborators = useMemo(() => {
  const map = new Map<string, Collaborator>();
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    const userId = state.user?.userId ?? null;
    const identity = userId ? resolveIdentity(userId) : null;
    map.set(String(clientId), {
      id: userId ?? String(clientId),
      socketId: String(clientId) as SocketId,
      pointer: state.pointer,
      button: state.button,
      selectedElementIds: state.selectedElementIds,
      username: identity?.name ?? friendlyName(null),
      avatarUrl: identity?.avatar_url ?? undefined,
      color: colorForClientId(clientId),
    });
  }
  return map;
}, [awarenessTick, resolveIdentity]);
```

`onPointerUpdate` prop on `<Excalidraw>` supplies `{ pointer, button }`;
forward it straight into awareness. Throttle to 20Hz (50ms) to keep
awareness chatter reasonable.

Selection publication uses `onChange`'s `appState.selectedElementIds`.
Diff and publish only when the set changes to avoid spamming.

## Search Indexing

No queue message shape change. `SEARCH_QUEUE` continues to carry
`{ type: "index-page", pageId }`.

Queue consumer (`src/worker/queues/search-indexer.ts`) changes:

1. Extend the page-row select to include `kind`.
2. Pass `kind` to `env.DocSync.getByName(pageId).getIndexPayload(pageId, kind)`.

DocSync changes:

1. `getIndexPayload(pageId, kind)` signature update.
2. Branch extraction: `kind === "canvas"` → `extractCanvasPlaintext`, else
   `extractPlaintext`.

`WorkspaceIndexer` receives the same `{title, bodyText}` contract — no change
there.

## Share and Read-Only

Share links work unchanged because the Worker's `onBeforeConnect` derives
`readOnly` from the same permissions path used by doc pages.
`CanvasPane` translates the affordance into Excalidraw props:

```tsx
<Excalidraw
  viewModeEnabled={!affordance.canEdit}
  UIOptions={{
    canvasActions: {
      changeViewBackgroundColor: affordance.canEdit,
      clearCanvas: affordance.canEdit,
      loadScene: false,
      saveToActiveFile: false,
      saveAsImage: true, // viewers can export PNG
      export: { saveFileToDisk: true },
      toggleTheme: null, // inherit from bland theme
    },
    tools: { image: affordance.canEdit },
  }}
  /* ... */
/>
```

For share-link viewers without auth (`!affordance.canEdit`), the R2 GET flow
uses `?share=shareToken` via the existing `resolveShareUrl` pattern. Threading
`shareToken` into `fetchUploadAsDataURL` is a parameter addition.

For peer awareness on shared links: follow the existing doc-page behavior —
publish only `{ userId: null }` for anonymous share viewers, resolve through
the same identity callback used today. `AvatarStack` already behaves
correctly for this case.

## Creation UX

Minimal first cut:

- Sidebar "New page" default stays `kind: "doc"`.
- Add a "New canvas" entry next to it. Placement options:
  - A dropdown chevron on the sidebar "New page" button, exposing
    `doc | canvas`.
  - A slash-menu entry on the empty-workspace state ("Start a canvas").
- Inside a doc, **do not** offer "insert canvas" — that is stage 2 embed.
- In the page-tree, render a distinct icon for canvas pages (suggest
  `lucide-react`'s `PenTool` or `Shapes`) — check with existing icon set in
  `src/client/components/ui/emoji-icon.tsx` and related. Detail to be
  finalized by the implementer.

Naming:

- Default title for a new canvas is `"Untitled"` (same as docs). No special
  casing.

## Package Choice

- **`@excalidraw/excalidraw@^0.18.0`** — current stable. MIT. ESM-only.
  Peer-deps `react@^18.2.0 || ^19.0.0` — bland is on React 19, so compatible.
  Expect transitive Radix peer-dep warnings (upstream issues
  [#9253](https://github.com/excalidraw/excalidraw/issues/9253),
  [#9435](https://github.com/excalidraw/excalidraw/issues/9435)); they are
  noise, functionality is fine.
- Import `"@excalidraw/excalidraw/index.css"` once, at the canvas pane (not
  at the app root). Lazy-loading the component pulls the CSS with it through
  the same chunk.
- **Self-host fonts.** Copy
  `node_modules/@excalidraw/excalidraw/dist/prod/fonts` into the Vite
  `public/` directory at build time (add a small copy step to the build
  pipeline) and set `window.EXCALIDRAW_ASSET_PATH = "/"` before the
  component mounts. Prevents a CDN round-trip and keeps the canvas working
  offline.
- **Bundle size.** Historically ~150–180KB gzipped for the main chunk plus
  ~50KB of fonts. Must be lazy-loaded.
- **License.** MIT. Retain the `LICENSE` text in the dist directory. No
  attribution or revenue-share requirements.

### Do not use `y-excalidraw`

Surveyed as prior art; rejected as a dependency. Reasons:

- No GitHub releases, low maintenance velocity, 35 stars.
- Uses `Y.Array<Y.Map>` for element storage — the same pattern bland
  initially considered and rejected once Yjs's "cannot move an integrated
  shared type" constraint was verified against `yjs@13.6.30`. Reorder
  semantics are unsafe without per-reorder cloning.
- Types drift from upstream Excalidraw versions, which will surface as
  runtime bugs on upgrade.

Use it as a reference implementation only. The binding described in
[ExcalidrawBinding](#excalidrawbinding) is smaller and tighter.

## Files to Touch

### New files

- `src/client/components/canvas/canvas-pane.tsx`
- `src/client/components/canvas/use-canvas-session.ts`
- `src/client/components/canvas/excalidraw-binding.ts`
- `src/client/components/canvas/fetch-upload-as-data-url.ts` _(or inline into
  `src/client/lib/uploads.ts` — see [Open Questions](#open-questions))_
- `src/client/lib/affordance/canvas.ts` — derive `{ canEdit, canInsertImages }`
  parallel to `editor.ts`
- `drizzle/migrations/NNNN_add_pages_kind.sql` — the column migration
- Excalidraw font asset pipeline additions under `public/fonts/` (generated
  at build)

### Modified files

- `src/worker/db/d1/schema.ts` — add `kind` column to `pages`.
- `src/shared/types.ts` — `PageKind`, add `kind` to `Page` and
  `CreatePageRequest`.
- `src/shared/constants.ts` — add the three new Yjs root keys.
- `src/worker/routes/pages.ts` — accept and return `kind`, reject `kind`
  mutations on PATCH.
- `src/worker/routes/shares.ts` — include `kind` in the
  `GET /share/:token` response so shared-root canvases seed correctly.
- `src/worker/durable-objects/doc-sync.ts` — extend `getIndexPayload`
  signature, branch extraction.
- `src/worker/lib/yjs-text.ts` — add `extractCanvasPlaintext`.
- `src/worker/queues/search-indexer.ts` — select `kind`, pass through.
- `src/client/lib/api.ts` — accept `kind` on `pages.create`.
- `src/client/lib/active-page-model.ts` — add `kind` to
  `ActivePageSnapshot`.
- `src/client/components/active-page/provider.tsx` — `snapshotFromPage`,
  `ActivePageSeed`, `seedToReadyState` all carry `kind`; propagate through
  IDB cache hydration.
- `src/client/components/active-page/shared.tsx` — include `kind:
rootPage.kind` in the seed passed to `ActivePageProvider`.
- `src/client/components/share/use-share-view.ts` — `ShareRootPage.kind`.
- `src/client/components/share/view-provider.tsx` (if resolution is
  handled there) — plumb `kind` from the share API response into
  `ShareRootPage`.
- `src/client/components/workspace/page-view.tsx` — branch on
  `snapshot.kind` to mount `CanvasPane` or `EditorPane`.
- `src/client/components/share/page-view.tsx` — same branch for shared
  surface.
- `src/client/components/sidebar/` — "New canvas" affordance in the
  create-page UI.
- `src/client/lib/affordance/workspace-page.ts` and `share-page.ts` — add
  a `canvas` affordance slot alongside `editor`, gated on `kind`.
- `src/client/lib/uploads.ts` — add `fetchUploadAsDataURL(uploadId,
shareToken?)` using `credentials: "include"` for members and
  `?share=token` for share viewers.
- `package.json` — add `@excalidraw/excalidraw` dependency.

## Implementation Order

1. **Data model end-to-end.** Schema migration, shared types, API route,
   client API, active-page snapshot, IDB cache compat. Ship and verify doc
   pages still work.
2. **Search indexing plumbing.** Extend `getIndexPayload` signature and
   queue consumer. For canvases without any content, this is tested by
   creating a canvas page (implementation in step 3) and confirming the
   title indexes. Safe to merge with step 1.
3. **Canvas pane skeleton.** Create `CanvasPane`, `useCanvasSession`,
   shallow-mount Excalidraw without the binding. Verify cold-start load,
   Yjs connection, title sync, sync dot, avatar stack.
4. **Element binding.** Implement `ExcalidrawBinding`. Single-peer
   correctness first (draw, reload, same drawing), then two-peer over real
   DocSync.
5. **AppState sync.** Debounced write + remote merge.
6. **Images.** `generateIdForFile`, upload flow, cold-start hydration,
   share-token fetch.
7. **Awareness.** Pointer + selection + collaborators prop.
8. **Share surface.** `viewModeEnabled` + locked `UIOptions` + share-token
   image fetch.
9. **Creation UX.** Sidebar "New canvas" entry.
10. **Polish.** Expand/collapse viewport overlay on the canvas (+
    Escape-to-collapse), icon for canvas pages in the tree, dark-mode
    binding, mobile smoke test, bundle-split verification.

Each step ends with `npm run typecheck` and a targeted Playwright run.

## Test Plan

### Vitest

- `src/worker/lib/yjs-text.test.ts` — `extractCanvasPlaintext` with fixtures:
  empty canvas, text elements only, mixed (text + frames + images), deleted
  tombstones.
- Binding unit tests (if the binding API is split into pure helpers):
  `reconcile local vs remote element` truth table for `version` and
  `versionNonce` permutations.

### Playwright

Add `tests/e2e/specs/13-canvas-basic.spec.ts`:

- Create a canvas page from the sidebar.
- Draw a rectangle.
- Reload the page.
- Assert the rectangle is still present.
- Assert the sync dot lands on "synced".

Add `tests/e2e/specs/14-canvas-collaboration.spec.ts`:

- Two browser contexts on the same canvas.
- Draw a rectangle in context A.
- Assert it appears in context B within 2s.
- Move it in B.
- Assert the new position replicates to A.

Add `tests/e2e/specs/15-canvas-image-upload.spec.ts`:

- Upload a PNG via the Excalidraw image tool.
- Assert the image renders.
- Reload.
- Assert the image still renders (cold-start hydration path).

Extend:

- `tests/e2e/specs/08-rapid-page-navigation.spec.ts` — include a canvas
  page in the navigation mix.
- `tests/e2e/specs/10-shared-rapid-navigation.spec.ts` — shared canvas
  read-only view.
- `tests/e2e/specs/12-canonical-page-cold-deep-link.spec.ts` — cold deep
  link to a canvas page.

### Manual

- Mobile: canvas interaction vs page scroll on a small viewport. Excalidraw
  is known to fight scroll containers; verify the canvas area and sidebar
  drawer behave correctly together.
- Offline: disconnect, draw, reconnect, verify IDB + sync reconcile.
- Bundle size: run `npm run build` and confirm the canvas chunk is separate
  from the doc editor chunk. Document the bundle-size delta in the PR body.

## Stage 2 Deferrals

Called out so they are not accidentally smuggled into stage 1:

- **Canvas as embed block inside a doc.** A Tiptap node (`canvasEmbed`) that
  points at a `pageId` of kind `canvas` and renders a read-only or
  click-to-open thumbnail inline. Requires:
  - SVG thumbnail generation (either client-side on last-edit, or a Worker
    path using a headless renderer).
  - A block affordance story that matches the existing image and callout
    patterns in the editor runtime context and affordance layer.
  - Navigation semantics: click opens the canvas page, not inline edit.
- **Kind conversion** (doc → canvas or vice versa).
- **Canvas-specific export** (PDF, PNG) from the page header menu.
- **Per-field element CRDT merges** if collaboration conflicts surface as a
  real problem.
- **Garbage collection of R2 blobs** for removed canvas images (falls under
  the existing deferred upload-GC concern in CLAUDE.md).
- **Collaborative undo** via a shared `Y.UndoManager`.
- **Canvas-page AI surface** (`docs/ai.md` coverage). Out of stage 1.

## Open Questions

1. **Affordance shape split.** The existing affordance layer models `editor`
   as one discriminated slot. Stage 1 adds `canvas`. Should
   `workspace-page` / `share-page` affordance expose both as mutually
   exclusive (only one is populated based on page kind) or always populate
   both and let the pane choose? Recommendation: mutually exclusive, driven
   by `snapshot.kind`.
2. **`fetchUploadAsDataURL` placement.** Keep inside
   `src/client/lib/uploads.ts` (alongside `uploadFile`) for a single source
   of truth on upload helpers, or isolate in
   `src/client/components/canvas/`. Recommendation:
   `src/client/lib/uploads.ts` — it mirrors upload call patterns and other
   surfaces (e.g. future canvas embed) will reuse it.
3. **Worker-side kind lookup caching.** The queue consumer now does a D1
   lookup per indexable page to pick up `kind`. That lookup already happens
   for `workspace_id` routing, so this is free — but verify it still fits
   within the existing D1 read budget per queue batch.
4. **`reconcileElements` export stability.** Excalidraw's
   `reconcileElements` is exported but not formally versioned. Pin to
   `0.18.x` and import from `@excalidraw/excalidraw/data/reconcile` (or the
   public `reconcileElements` re-export, whichever is stable at 0.18.0). If
   neither is stable, inline a ~30-line reimplementation of the
   `version`/`versionNonce` rule in the binding. The implementation agent
   should verify on `npm install` and pick one path.
5. **Bundle budget.** Does the canvas chunk regress first paint on doc
   pages? Verify no synchronous imports leak from `canvas-pane.tsx` into
   the main bundle, and that `workspace/page-view.tsx` only imports the
   pane lazily.

## References

- bland callout spec for style: [docs/callout.md](./callout.md)
- bland page-mention spec for style: [docs/page-mention.md](./page-mention.md)
- permission architecture handoff:
  [docs/permission-architecture-handoff.md](./permission-architecture-handoff.md)
- editor-v2 design: [docs/editor-v2-tiptap.md](./editor-v2-tiptap.md)
- frontend spec: [docs/frontend-spec.md](./frontend-spec.md)
- Excalidraw package docs:
  <https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation>
- Excalidraw reconciler blog:
  <https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature>
- `y-excalidraw` (reference only):
  <https://github.com/RahulBadenkal/y-excalidraw>
- AFFiNE Excalidraw discussion (prior art on embed-as-block patterns):
  <https://github.com/toeverything/AFFiNE/discussions/5165>
