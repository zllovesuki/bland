# Page Archive Visibility Contract Plan

Status: implementation-ready plan

Date: 2026-05-25

## Decision

Change page archive from a structural operation into a visibility operation.

Archiving a page must:

- mark the selected page and its active descendants as archived
- leave `pages.parent_id` unchanged
- leave `pages.position` unchanged
- preserve shares, uploads, published-page rows, DocSync snapshots, and Sites
  artifacts as recoverable state
- hide archived rows from active app, shared, search, upload, AI, DocSync, and
  public Sites surfaces through the existing `archived_at` checks

Restoring a page must:

- clear archive state for the archived operation rooted at that page
- leave `pages.parent_id` and `pages.position` unchanged
- restore only rows archived by that archive operation
- not restore descendants that were already archived before the parent was
  archived

This replaces the current live behavior where `DELETE /workspaces/:wid/pages/:id`
archives only the selected row and promotes direct children to workspace roots.

## Current Live Contract

The live tree uses `pages.parent_id`, `pages.position`, and `pages.archived_at`.
The important current behavior is in:

- `src/worker/routes/pages.ts`
  - page list filters `archived_at IS NULL`
  - update/move and page reads use `getPage`, which only returns non-archived
    rows
  - delete archives the selected page, then updates direct children to
    `parent_id = NULL`
- `src/client/stores/db/workspace-replica.ts`
  - `archivePage` deletes the archived parent from Dexie and promotes its
    direct children to roots
- `src/client/lib/page-archive.ts`
  - confirmation copy explicitly says direct child pages are promoted
- `src/worker/lib/page-access.ts`
  - `getPage` treats archived pages as missing
- `src/worker/lib/permissions.ts`
  - page-share inheritance walks only unarchived pages
- `src/worker/lib/published-pages.ts`
  - public Sites resolution walks only unarchived pages
- `src/worker/index.ts`
  - DocSync WebSocket admission rejects archived pages
- `src/worker/routes/search.ts` and `src/worker/queues/search-indexer.ts`
  - search filters or removes archived pages
- `src/worker/routes/uploads.ts`
  - page-scoped uploads are concealed when their page is archived

Most subsystems already treat `archived_at` as the visibility boundary. The
main incompatible behavior is the archive mutation itself and the local replica
mirror.

## Data Contract

Add one nullable column to `pages`:

```sql
archive_root_id TEXT
```

Recommended schema source change:

- `src/worker/db/d1/schema.ts`
  - add `archive_root_id: text("archive_root_id")`
  - add an index for archive-operation lookups, for example
    `(workspace_id, archive_root_id, archived_at)`
  - add a partial index for trash-root listing:
    `(workspace_id, archived_at) WHERE archived_at IS NOT NULL AND archive_root_id = id`

Recommended shared type change:

- `src/shared/types.ts`
  - add `archive_root_id: z.string().nullable()` to `Page`
  - update page creation and restore responses so active rows serialize
    `archive_root_id: null`

The contract is:

- `archived_at IS NULL` means the page is active.
- `archived_at IS NOT NULL` means the page is archived and hidden from active
  surfaces.
- `archive_root_id` is null for active rows.
- When an archive operation succeeds for page `R`, every active row in `R`'s
  descendant closure at mutation time gets:
  - `archived_at = operation timestamp`
  - `archive_root_id = R`
- Rows already archived before the operation are not changed.
- A restorable trash root is an archived page where `archive_root_id = id`.
- Restoring root `R` clears archive state for descendant rows whose
  `archive_root_id = R`.

This is intentionally smaller than an archive-generations table. It still gives
restore enough identity to avoid accidentally restoring independently archived
descendants.

This v1 contract does not try to repair rare concurrent create or move races.
Normal create and move routes continue to require active parents. Restore remains
fail-closed when the current tree shape would place restored rows under an
archived ancestor.

## Platform Constraints

Cloudflare D1 documents a maximum of 100 bound parameters per query:

- https://developers.cloudflare.com/d1/platform/limits/

Do not implement subtree archive or restore by binding one parameter per page id
in a large `IN (?, ?, ...)` list. A deeply populated page subtree can exceed the
limit even though the tree depth is capped.

Use recursive CTEs for subtree selection and update statements so each D1 query
binds only stable scalar inputs such as `workspaceId`, `pageId`, `archiveRootId`,
timestamps, and `MAX_TREE_DEPTH - 1`.

Every recursive CTE in this change, including mutation CTEs, must carry a
`depth` column and stop at `MAX_TREE_DEPTH - 1`. If a helper must chunk work,
keep each individual query below 100 bound parameters; remember that D1 batch
limits apply to each statement inside `db.batch()`.

## Migration

Generate a D1 migration from the schema source. Do not hand-edit generated
Drizzle output unless generation cannot express the required column or index.

Migration requirements:

1. Add nullable `pages.archive_root_id`.
2. Add `(workspace_id, archive_root_id, archived_at)` for restore, descendant
   count, and other archive-operation lookups.
3. Add a partial trash-root index on `(workspace_id, archived_at)` where
   `archived_at IS NOT NULL AND archive_root_id = id`.

Legacy note:

- Existing archived pages were archived under the old contract, so their direct
  children may already have been promoted to roots.
- Do not backfill those rows in the live application migration.
- Treat legacy rows that have `archived_at IS NOT NULL` and a null
  `archive_root_id` as an operator concern. Operators may choose to make those
  pages restorable as single-page archive roots with a one-off SQL runbook:

  ```sql
  UPDATE pages
  SET archive_root_id = id
  WHERE archived_at IS NOT NULL
    AND archive_root_id IS NULL;
  ```

- If operators do not run the backfill, the trash listing should ignore those
  legacy rows. The restore route should not carry special-case legacy semantics;
  the normal `archive_root_id !== id` check returns 409 `not_archive_root`.

## Worker Implementation

### Shared page-tree helpers

Extend `src/worker/lib/page-tree.ts` with helpers that can see archived rows:

- `getPageSubtreeRows(db, pageId, workspaceId)`
  - recursive CTE from `pageId`
  - walks descendants by `parent_id`
  - bounds recursion with `MAX_TREE_DEPTH - 1`
  - returns id, parent_id, created_by, archived_at, archive_root_id, kind
- `getArchivedAncestorRows(db, pageId, workspaceId)`
  - walks ancestors and returns archived ancestors

Keep the existing active-only helpers for active page reads where appropriate,
but update move validation as described below.

### Archive route

Update `DELETE /workspaces/:wid/pages/:id` in `src/worker/routes/pages.ts`.

Algorithm:

1. Require membership as today.
2. Load the root with `getPage`; archived roots still return 404.
3. Load the full descendant closure.
4. Build `rowsToArchive = subtreeRows.filter(row => row.archived_at === null)`.
5. Authorization:
   - owner/admin can archive the whole active subtree
   - member can archive only if every active row in `rowsToArchive` was created
     by that user
   - guest/non-member cannot archive
6. Run one visibility update with a recursive CTE. Do not bind archived ids in
   an `IN (...)` parameter list:

   ```sql
   WITH RECURSIVE descendants(id, depth) AS (
     SELECT id, 0
     FROM pages
     WHERE id = ? AND workspace_id = ?

     UNION ALL

     SELECT child.id, d.depth + 1
     FROM pages child
     JOIN descendants d ON child.parent_id = d.id
     WHERE child.workspace_id = ?
       AND d.depth < ?
   )
   UPDATE pages
   SET archived_at = ?, archive_root_id = ?, updated_at = ?
   WHERE workspace_id = ?
     AND archived_at IS NULL
     AND id IN (SELECT id FROM descendants)
   ```

7. Do not update `parent_id`.
8. Bump the public site revision once for the workspace.
9. Enqueue `index-page` for every archived page id so FTS removes all archived
   descendants, not only the selected root.
10. Send queue messages in bounded batches and keep failure non-fatal, matching
    current derived-index behavior.
11. Return:

```ts
{ ok: true, archived_page_ids: string[] }
```

The route should be idempotent from the caller perspective only for active
pages. Re-archiving an already archived page should keep returning 404 through
`getPage`, matching current archived-as-missing behavior.

### Restore route

Add:

```http
POST /workspaces/:wid/pages/:id/restore
```

Algorithm:

1. Require membership.
2. Load the page including archived rows.
3. If missing, return 404.
4. If not archived, return 409 `not_archived`.
5. If `archive_root_id !== id`, return 409 `not_archive_root`.
6. Check archived ancestors outside this restore operation:
   - if any ancestor is archived, return 409 `archived_ancestor`
   - this prevents restoring a child into a still-archived parent
7. Load descendant rows.
8. Build `rowsToRestore = rows.filter(row => row.archive_root_id === id)`.
9. Authorization:
   - owner/admin can restore
   - member can restore only if every row in `rowsToRestore` was created by
     that user
   - this prevents a member from restoring a mixed-ownership subtree that an
     owner/admin archived
10. Clear archive state with a recursive CTE. Do not bind restored ids in an
    `IN (...)` parameter list:

    ```sql
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT id, 0
      FROM pages
      WHERE id = ? AND workspace_id = ?

      UNION ALL

      SELECT child.id, d.depth + 1
      FROM pages child
      JOIN descendants d ON child.parent_id = d.id
      WHERE child.workspace_id = ?
        AND d.depth < ?
    )
    UPDATE pages
    SET archived_at = NULL, archive_root_id = NULL, updated_at = ?
    WHERE workspace_id = ?
      AND archive_root_id = ?
      AND id IN (SELECT id FROM descendants)
    ```

11. Bump public site revision once.
12. Enqueue `index-page` for every restored page id so FTS re-indexes them.
13. Send queue messages in bounded batches and keep failure non-fatal, matching
    current derived-index behavior.
14. Do not enqueue `page-projection` solely for restore. Sites JSON artifacts
    self-heal on request, and archive/restore does not change document body
    content.
15. Return:

    ```ts
    { ok: true, pages: Page[] }
    ```

The returned pages let the client upsert restored rows into the workspace
replica without waiting for a full workspace reload.

### Trash listing route

For the initial trash bin, add:

```http
GET /workspaces/:wid/pages/archived
```

Register this route before `GET /workspaces/:wid/pages/:id` so `archived`
cannot be parsed as a page id.

Return only archive roots:

```ts
{
  pages: Array<
    Page & {
      archived_descendant_count: number;
    }
  >;
}
```

This keeps the first UI simple. The restore route is authoritative for whether
the row can actually be restored. The trash-root query should be shaped to use
the partial trash-root index:

```sql
WHERE workspace_id = ?
  AND archived_at IS NOT NULL
  AND archive_root_id = id
ORDER BY archived_at DESC
```

Access:

- owner/admin can see every archive root in the workspace
- member can see archive roots whose root page they created; restore can still
  be rejected if the archived operation includes rows created by someone else
- guest/non-member gets 403 or an empty list; prefer 403 for member-only trash
  management

Do not include full descendant trees or precomputed restore eligibility in v1. A
restore operates by root id and surfaces route errors such as
`archived_ancestor`, `not_archive_root`, or `forbidden`.

### Move validation

Because archived descendants keep their `parent_id`, moving an active ancestor
also moves the future restore location of archived descendants.

Keep the existing move validation path, but make `getPageSubtreeMaxDepth`
consider all descendants, including archived descendants. Do not add a new move
state machine or client-side hidden-descendant model. The client move model can
remain active-only; the worker may reject the rare move that would exceed
`MAX_TREE_DEPTH` after restore.

## Client Implementation

### API client

Update `src/client/lib/api.ts`:

- `api.pages.delete` returns `{ ok: boolean; archived_page_ids: string[] }`
- add `api.pages.restore(workspaceId, pageId)`
- add `api.pages.archived(workspaceId)` for the trash bin route

### Local replica

Replace the current `replicaCommands.archivePage` behavior.

Do not promote children locally.

Recommended minimal client behavior:

- add `replicaCommands.removePages(workspaceId, pageIds)`
- after archive succeeds, remove every returned archived id from
  `workspacePages` and `pageAccess`
- after restore succeeds, upsert returned pages

This keeps archived pages out of canonical offline page loading. Trash should
come from the dedicated archived-pages API, not from the normal workspace
replica.

### Sidebar archive action

Update `src/client/components/sidebar/page-tree-item.tsx`:

- compute active descendant ids from the current tree index, not just direct
  child count
- use the new confirm copy:
  - no descendants: `"Title" will be moved to trash.`
  - descendants: `"Title" and N subpages will be moved to trash.`
- call `api.pages.delete`
- remove all returned ids from the local replica
- navigate away if the current route page id is one of the archived ids

Update `src/client/lib/page-archive.ts` accordingly.

### Trash restore UI

When adding the minimal trash bin UI:

- fetch archive roots from `GET /workspaces/:wid/pages/archived`
- call `api.pages.restore`
- upsert returned pages into the replica
- show the restore route error message if restore fails
- if restoring the last visited page, normal root redirect behavior can pick it
  up after replica hydration

## Subsystem Impact

### Active workspace tree

Normal workspace page list already filters archived rows. After this change,
archiving a parent removes the parent and all active descendants from the
sidebar because all those rows become archived.

Normal create and move routes continue to require active parents. This v1 does
not add a repair pass for rare concurrent races that could leave an active row
under an archived parent.

### Permissions and shares

Share rows are preserved.

Archived pages remain inaccessible because `resolvePageAccessLevels` walks only
unarchived pages and starts from an unarchived target. Restore makes preserved
shares effective again.

Member-only archive requires a new subtree ownership check. Without it, a member
who owns a parent could hide child pages created by someone else.

### Uploads

Page-scoped uploads are preserved. `GET /uploads/:id` already calls `getPage`,
so uploads linked to archived pages remain concealed until restore.

Workspace-scoped uploads are unaffected.

### Search

The archive route must enqueue every archived page id, not only the root.

The restore route must enqueue every restored page id so the
`WorkspaceIndexer` repopulates FTS.

Search route post-filtering remains correct because it filters D1 rows with
`archived_at`.

### Sites

Published-page rows and site settings are preserved.

Archived pages and archived descendants under published roots are not public
because Sites resolution filters `archived_at IS NULL` at the target and every
ancestor.

Restore can make previously published rows public again. This is consistent
with archive as visibility, not unpublish. Product copy should treat restore as
restoring public reachability too.

Archive and restore should bump the workspace site revision once. Existing
request-keyed Cache API entries may remain public until their bounded TTL, which
is already the documented Sites behavior for archive/unpublish-like changes.

### Page mentions

Archived mentioned pages collapse to restricted entries today. Restore makes
mention metadata resolvable again. No schema change is needed beyond the shared
`Page` type.

### AI

AI gates through `getPage` and page access. Archived pages remain unavailable.
No separate AI change is required.

### DocSync

New DocSync connections are rejected for archived pages by WebSocket admission
and snapshot routes.

Existing open DocSync sessions are not currently revoked when a page is
archived. This is existing behavior, not introduced by the contract change.
Do not block this simpler archive contract on session revocation, but keep tests
grounded in new requests after archive, not already-open sockets.

### D1 and Durable Objects

D1 remains authoritative for page metadata, archive visibility, and tree shape.
DocSync Durable Objects remain authoritative for document content snapshots.

Archive and restore should not call Durable Objects directly except through
existing derived queue work. Keep Worker orchestration one-hop.

## Edge Cases

### Already archived descendant

Setup:

- child `C` is archived first with `archive_root_id = C`
- later parent `P` is archived

Expected:

- parent archive updates active rows under `P`
- `C` keeps its original `archived_at` and `archive_root_id`
- restoring `P` does not restore `C`
- after `P` is restored, `C` can be restored separately

### Restore while parent is still archived

Setup:

- `C` is an archive root
- an ancestor `P` is also archived

Expected:

- restoring `C` returns 409 `archived_ancestor`
- user must restore `P` first

### Member owns parent but not child

Setup:

- member owns parent `P`
- another user owns active child `C`

Expected:

- member archive of `P` returns 403
- owner/admin archive of `P` succeeds

### Move active page with hidden archived descendants

Setup:

- active page `P` has archived descendant `C`
- user moves `P` deeper

Expected:

- server validates max depth using all descendants, including `C`
- move is rejected if restoring `C` later would exceed `MAX_TREE_DEPTH`

### Legacy archived page

Setup:

- page was archived before this migration

Expected:

- live code does not backfill or infer `archive_root_id`
- trash listing ignores the row while `archive_root_id` is null
- restore returns 409 `not_archive_root`
- an operator can run the optional backfill to make it restorable as a
  single-page archive root
- old child promotion is not reversible

### Concurrent archive and restore

Expected:

- archived-as-missing behavior prevents normal re-archive of already archived
  roots
- restore updates only rows whose `archive_root_id` matches the root
- no repair pass is added for concurrent create, move, archive, or restore races
- if a route precondition is no longer true, return the normal 404, 403, or 409
  response for that state

## Tests

Add or update focused tests for the changed contract.

Worker tests:

- archive parent archives active child and grandchild, preserves `parent_id`
- archive and restore work for subtrees larger than 100 pages without exceeding
  D1 bound-parameter limits
- archive response includes all archived ids
- member cannot archive a subtree containing another user's active page
- archive skips already archived descendants
- restore clears only rows with matching `archive_root_id`
- restore rejects non-root archived descendants
- restore rejects while an ancestor is still archived
- legacy archived rows with null `archive_root_id` are ignored by trash listing
- `validatePageMove` counts archived descendants for depth
- search index queue removes every archived subtree page and reindexes restored
  pages
- Sites still 404 archived descendants under a published root and serves them
  again after restore
- upload access remains 404 while archived and works after restore

Client tests:

- replica archive removes all returned ids and does not reparent children
- sidebar confirmation counts all active descendants
- active route navigates away when the current page is any archived descendant
- restore upserts returned pages
- page tree and move dialog continue to ignore archived rows

Recommended command set after implementation:

```sh
npm run typecheck
npm run lint
npm run test:worker
npm run test:client
```

Run `npm run build` as well if route wiring, generated migration imports, or
bundling behavior changes.

## Implementation Order

1. Add the schema column, shared type field, and D1 migration with no legacy
   backfill.
2. Add worker page-tree helpers for full descendant and archived-ancestor
   lookups.
3. Change archive route to subtree visibility update and return archived ids.
4. Add restore route.
5. Add archived-roots list route for trash.
6. Update move validation to include archived descendants.
7. Update API client and local replica commands.
8. Update sidebar archive copy and navigation behavior.
9. Add the minimal trash restore UI.
10. Add focused worker and client tests.
11. Run validation commands.

## Non-goals

- Do not hard-delete archived pages.
- Do not delete shares, uploads, DocSync snapshots, Sites artifacts, or
  published-page rows during archive.
- Do not add a full archive-generations table in this change.
- Do not implement DocSync session revocation as part of this simple contract
  change.
- Do not attempt to reconstruct parent links for pages archived before this
  migration.
