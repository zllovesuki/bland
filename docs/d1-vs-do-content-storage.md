# D1 vs Durable Object Storage for Page Content

Date: 2026-04-05

## Context

D1 has a 10GB per-database limit. With `doc_snapshots` storing Yjs blobs plus
`pages_fts` storing extracted plaintext, there is a question of how many pages
D1 can hold before hitting that ceiling, and whether moving document content
into per-page Durable Object SQLite storage would be a better long-term design.

The current spec ([bland-production-spec.md](./bland-production-spec.md))
stores Yjs snapshots in D1 via
`DocSync.onLoad`/`onSave` callbacks (snapshot mode). Each page's full Yjs
state vector is a single blob in `doc_snapshots`.

## Current design

- `doc_snapshots` table in D1: `page_id` (PK) + `yjs_state` (BLOB) + `snapshot_at`
- `DocSync` DO is declared with `new_sqlite_classes` in `wrangler.jsonc`,
  meaning each instance already has its own SQLite
- The DO holds Yjs state in memory while active, persists to D1 on debounced
  save, and hibernates when all clients disconnect
- FTS rebuild is designed to iterate `doc_snapshots` in D1
- D1 Time Travel covers all content for disaster recovery

## What moving content to DO-local SQLite would change

### Easy (small code diff)

- `DocSync.onLoad`/`onSave` swap D1 queries for `this.ctx.storage.sql`.
  Simpler code, no network hop for persistence.
- `doc_snapshots` could be dropped from D1 or kept as metadata-only
  (page_id + snapshot_at, no blob). D1 shrinks dramatically.

### Medium (design decisions needed)

- **FTS/search indexing**: The queue consumer currently plans to load from
  `doc_snapshots` in D1. Options:
  - Consumer fetches the DO to get the blob (wakes hibernated DOs for indexing).
  - `DocSync.onSave` extracts plaintext and sends it in the queue message.
    However, Cloudflare Queues caps message size at 128KB, so this breaks on
    larger documents. Not viable as the default design without a hard page-size
    ceiling well under the queue payload limit.
  - Best option: keep sending just `page_id` in the queue message. Consumer
    reads the blob from wherever it lives.

- **REST content reads** (public shares, export, non-WebSocket page loads):
  Every content read must route through the DO. No single D1 query path.

### Hard (operational model changes)

- **Disaster recovery**: D1 Time Travel no longer covers content. Per-object
  DO PITR exists but there is no "restore all documents to point X."
- **FTS rebuild**: Becomes "enumerate pages from D1, fetch each DO" instead
  of "iterate `doc_snapshots`." Slower, wakes every DO, costs more.
- **Bulk export / admin tooling**: Same problem. No single query for all content.

## Constraints that apply to both approaches

- **2MB blob limit**: D1 has a 2MB max row/BLOB size, and SQLite-backed
  Durable Objects have the same 2MB limit. Moving to DO storage does not
  buy larger documents. The ceiling is the same; you just get more of them.
- **DO location pinning**: D1 has global read replicas (via Sessions API and
  bookmark propagation, already wired in bland). A Durable Object is pinned
  to one colo after creation and does not relocate. Cold reads and public
  share views pay that routing cost, which is meaningfully worse than a
  D1 read-replica hit. This matters because page views are read-heavy.

## Storage estimates

D1 blob limit is 2MB per row. The spec says typical pages serialize to
50-200KB. At 200KB average, 10GB gets roughly 50,000 pages. At 500KB
(heavy pages), still roughly 20,000. The 5,000 estimate is pessimistic
unless pages are very heavy or FTS dominates storage.

The FTS table (`pages_fts` via `drizzle/0001_fts5_pages.sql`) stores title
and body_text plus trigram index data. This roughly doubles the per-page
footprint in D1 and may be worth re-examining before moving content out.

## Decision

Keep `doc_snapshots` in D1. Build `DocSync.onLoad`/`onSave` against D1 as
the spec describes. Measure actual `yjs_state` sizes and D1 growth after M2
lands with real documents.

## Escape hatch if needed later

If D1 growth becomes a problem, the preferred approach is a lazy migration
rather than a bulk backfill or flag day:

```
onLoad:
  local = read from DO SQLite
  if local exists -> return local
  d1row = read from D1 doc_snapshots
  if d1row exists -> write to DO SQLite, return it
  return null
```

Pages migrate incrementally as they are opened. Keep D1 blobs until search
and export no longer depend on them. Only then delete D1 snapshot rows.

Before reaching for this, first re-examine the FTS storage shape in D1 --
it may be the bigger contributor to D1 growth than the snapshots themselves.

## Sources

- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- DO data location: https://developers.cloudflare.com/durable-objects/reference/data-location/
