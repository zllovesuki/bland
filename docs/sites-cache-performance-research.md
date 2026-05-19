# Sites cache performance research

Date: 2026-05-19

This note records a read-only research pass on Bland Sites caching, cache purge
behavior, and whether `caches.default` would materially improve the current
Sites HTML cache path.

## Summary

Bland Sites currently resolves D1 before reading the Worker Cache API entry for
public HTML. This is correct for immediate fail-closed behavior, but it prevents
true HTML cache hits that bypass D1 entirely.

If Bland can accept bounded public-site staleness, the strongest performance
option is a short-TTL, request-keyed HTML cache checked before D1, plus
best-effort global purge by cache tag. Keep D1-first behavior for surfaces where
immediate unpublish or asset revocation is still a hard requirement.

Do not switch the current Sites HTML cache from `caches.open("sites:v1")` to
`caches.default` as a performance change. In this code path, the measured
latency is dominated by D1-first site/page resolution; the Cache API read itself
is already cheap, and `caches.default` would not change cache locality, Tiered
Cache behavior, invalidation semantics, or the need to run the D1 resolver
before the current revision-keyed cache lookup.

## Current code path

Relevant live files:

- `src/worker/lib/http-entry.ts`: Sites host dispatch runs before API, uploads,
  assets, and SPA shell routing.
- `src/worker/sites/router.ts`: Sites create a D1 session with
  `first-unconstrained`, resolve the site/page, then call the HTML cache path.
- `src/worker/lib/published-pages.ts`: `resolvePublishedSitePage` checks
  `workspace_sites`, target page metadata, archived state, document kind, and
  nearest published root.
- `src/worker/sites/cache.ts`: `getSitesCache()` currently uses
  `caches.open("sites:v1")`; the cache key includes a render dependency
  revision derived from D1-resolved site/page fields.
- `tests/worker/sites/dispatch.workers.test.ts`: the test named
  "D1 runs before cache: unpublishing 404s the next request despite a prior
  cache hit" locks in the current fail-closed contract.

Because the current HTML cache key depends on D1-derived data, the cache cannot
be checked before D1 without a new key shape.

## Production validation

Target checked: `https://hi.bland.site/`.

Lighthouse was run read-only with local Lighthouse 13.3.0 and Playwright
Chromium. The JSON report was written to `/tmp/hi-bland-lighthouse.json`.

Scores and metrics:

- Performance: 96
- Accessibility: 96
- Best Practices: 96
- SEO: 100
- Agentic Browsing: 99
- FCP: 1.3 s
- LCP: 2.4 s
- Speed Index: 3.0 s
- TBT: 0 ms reported, 2.5 ms numeric
- CLS: 0.054
- Root document server response audit: about 893 ms

The Lighthouse result showed a small total page transfer, about 204 KiB. It
flagged only a small jsDelivr emoji PNG cache opportunity, render-blocking
CSS/fonts, and about 34 KiB of unused JS.

Repeated header checks on `https://hi.bland.site/` showed the same ETag and no
`cf-cache-status` on the HTML response. The `server-timing` values showed the
current D1-before-cache path clearly:

```text
cache-control: public, max-age=0, must-revalidate
etag: "sites-html:flGJcuw1B_y-94B4KxQuEpLw76nI8Lk_EYHuRjRbOgU"
last-modified: Sun, 17 May 2026 10:52:26 GMT
server-timing: site_page_lookup;dur=778.0,cache_read;dur=10.0,r2_document;dur=26.0,asset_manifest;dur=7.0,mention_resolution;dur=135.0,render_stream;dur=0.0,cache_write;desc="scheduled",total;dur=956.0;desc="Total Response Time"

server-timing: site_page_lookup;dur=241.0,cache_read;dur=4.0,cache_write;desc="skipped_hit",total;dur=245.0;desc="Total Response Time"
server-timing: site_page_lookup;dur=55.0,cache_read;dur=14.0,cache_write;desc="skipped_hit",total;dur=69.0;desc="Total Response Time"
server-timing: site_page_lookup;dur=38.0,cache_read;dur=7.0,cache_write;desc="skipped_hit",total;dur=45.0;desc="Total Response Time"
server-timing: site_page_lookup;dur=48.0,cache_read;dur=3.0,cache_write;desc="skipped_hit",total;dur=51.0;desc="Total Response Time"
```

Interpretation:

- A warm HTML body cache hit still pays `site_page_lookup`.
- The cache hit itself is cheap, commonly single-digit milliseconds in this
  sample.
- The first sampled request missed the HTML cache in that data center and paid
  D1, R2 document read, asset manifest resolution, mention resolution, render,
  and cache write.
- The visible issue is initial document latency. Payload size is not the main
  problem.

## Cloudflare findings

The following points were verified against Cloudflare documentation on
2026-05-19.

- Workers run before cache. Worker Cache API can cache generated Worker
  responses, but a Worker must explicitly call `cache.match()` or `cache.put()`.
- `caches.default` is synchronous and points at the default cache namespace.
  `caches.open(name)` is asynchronous and opens a named namespace.
- Within the current D1-first Sites path, switching from
  `caches.open("sites:v1")` to `caches.default` would only avoid opening the
  named namespace. It would not remove `site_page_lookup`, which is the visible
  warm-hit cost in the production sample.
- Worker Cache API entries are local to the data center that handled the
  request. `cache.match()`, `cache.put()`, and `cache.delete()` do not replicate
  entries globally and do not use Tiered Cache.
- `cache.delete()` only deletes in the current data center. Global invalidation
  requires Cloudflare purge APIs.
- Cache API respects `Cache-Control`, `Cache-Tag`, `ETag`, `Expires`, and
  `Last-Modified` headers on responses passed to `cache.put()`.
- `stale-while-revalidate` and `stale-if-error` are not supported by Cache API
  methods `cache.match()` and `cache.put()`.
- CDN/fetch caching can use `stale-while-revalidate`, and Cloudflare now serves
  that revalidation asynchronously for Free, Pro, and Business zones. This does
  not apply to the current Worker Cache API path.
- Cache-tag purge is the best fit for generated Sites HTML. Cloudflare strips
  `Cache-Tag` before responses reach visitors.
- Purge by URL is not reliable for Cache API entries that use a Worker-created
  custom cache key. Purge by tag, host, prefix, or purge everything are the
  relevant global options.
- D1 read replication can lower read latency if the database has replicas
  enabled and code uses the Sessions API. Bland Sites already uses
  `first-unconstrained`, which is the appropriate relaxed read constraint if
  the public Sites path tolerates replica lag.

Useful source URLs:

- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/workers/reference/how-the-cache-works/
- https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/
- https://developers.cloudflare.com/cache/how-to/purge-cache/purge-cache-key/
- https://developers.cloudflare.com/cache/how-to/purge-cache/
- https://developers.cloudflare.com/cache/concepts/cache-control/
- https://developers.cloudflare.com/cache/concepts/revalidation/
- https://developers.cloudflare.com/d1/best-practices/read-replication/

## Option A: keep D1-first

This keeps the current security and publication semantics:

- Unpublish, archive, move out of a published tree, slug change, and home page
  change can take effect on the next request.
- Cached HTML is only a body cache, not an authorization or reachability cache.
- Stale R2 and Cache API entries are harmless as long as D1 still gates them.

Performance work under this option:

- Keep `caches.open("sites:v1")`; the named namespace makes Sites cache
  ownership explicit and gives a simple namespace/version escape hatch.
- Verify D1 read replication is enabled for `bland-prod`.
- Add production metrics for `site_page_lookup`, `cache_read`, total
  `server-timing`, and full TTFB by colo or region.
- Consider optimizing the published-page resolver only if measured p95/p99 D1
  lookup time is high.

This option is the safest default.

## Option B: HTML cache before D1

This changes the public Sites contract to allow bounded stale HTML.

Shape:

1. Build a request cache key from normalized `scheme + host + pathname`.
2. Drop visitor query params.
3. Check the cache before creating a D1 session.
4. On hit, return cached HTML immediately.
5. On miss, run today's D1 resolver and render path.
6. Cache only 200 HTML responses.
7. Store with a short internal TTL, for example 60 to 300 seconds.
8. Add cache tags such as `site:<workspaceId>`, `page:<pageId>`,
   `root:<publishedRootId>`, and `sites-html`.
9. On publish, unpublish, archive, move, slug change, home page change, and
   document save, call Cloudflare purge-by-tag in `ctx.waitUntil()`.
10. Treat TTL as the correctness backstop when purge fails or is delayed.

Benefits:

- Warm HTML hits can skip D1 entirely.
- The current production sample suggests this can remove roughly 40 to 250 ms
  from common warm responses, and more from cold or distant D1 paths.
- Purge tags give broad invalidation without trying to enumerate every URL.

Tradeoffs:

- A page can remain public until purge lands or TTL expires.
- HTML can show old title, icon, cover, mention reachability, or old body for
  the stale window.
- The first request in each data center still misses because Cache API storage
  is local.
- This still does not get Tiered Cache or Cache API stale-while-revalidate.

Recommended guardrails:

- Start with HTML only. Do not pre-D1-cache public assets in the same change.
- Keep 404s and redirects uncached or extremely short-lived.
- Keep browser-facing `Cache-Control` conservative unless product explicitly
  wants browser-level staleness.
- Add tests that replace the current immediate-unpublish expectation with the
  new bounded-staleness contract only if product accepts that contract.

## Asset cache note

Pre-D1 caching for `/_assets/<pageId>/<uploadId>` is riskier than HTML because
it can expose an uploaded image after unpublish or archive until purge or TTL.
If Bland accepts that later, tag asset responses with `site:<workspaceId>`,
`page:<pageId>`, and `upload:<uploadId>`, and use a short TTL. Keep it separate
from the HTML cache change.

## Decision: keep `caches.open("sites:v1")`

`caches.default` is not recommended for Sites right now.

Reasons:

- The current cache lookup happens after D1 site/page resolution and after the
  HTML revision is computed from D1-derived fields.
- Warm production responses showed `site_page_lookup` as the dominant remaining
  cost, while `cache_read` was commonly single-digit milliseconds.
- `caches.default` still uses Worker Cache API storage, so it remains per data
  center and still does not use Tiered Cache.
- The named `sites:v1` cache makes ownership explicit and leaves room for
  versioned cache separation without changing cache-key shape.
- `caches.default` has extra TypeScript friction outside the Worker-only config
  because DOM `CacheStorage` does not include Cloudflare's `default` property.

If future measurements show that `caches.open("sites:v1")` itself is material,
revisit this with a targeted benchmark. Do not make the change as part of the
Sites latency work without measurement.

## TypeScript note if `caches.default` is revisited

The generated Worker types live in `worker-configuration.d.ts`, not directly in
`@cloudflare/workers-types`.

Targeted inspection found:

```text
worker-configuration.d.ts:444 declares `const caches: CacheStorage`
worker-configuration.d.ts:1022 declares `abstract class CacheStorage`
worker-configuration.d.ts:1029 declares `readonly default: Cache`
```

Current project configs are split by runtime:

- `tsconfig.worker.json` uses `lib: ["ES2022"]` plus
  `worker-configuration.d.ts`, so direct `caches.default` compiles in Worker
  source.
- `tsconfig.client.json` and `tests/tsconfig.client.json` include DOM libs. The
  standard DOM `CacheStorage` type does not have Cloudflare's `default`
  property.
- `tests/tsconfig.worker.json` keeps Worker, Sites static rendering, and shared
  tests on the Worker no-DOM type surface so Worker modules imported by tests
  see Cloudflare's `CacheStorage`.

An in-memory TypeScript check against the current configs showed:

```text
tsconfig.worker.json:
caches.default: compiles
globalThis.caches.default: TS2339 Property 'caches' does not exist on type 'typeof globalThis'

tests/tsconfig.client.json:
caches.default: TS2339 Property 'default' does not exist on type 'CacheStorage'
globalThis.caches.default: TS2339 Property 'default' does not exist on type 'CacheStorage'
```

The test config used to matter because a single DOM-enabled test tsconfig
imported Worker modules, so a direct `caches.default` in
`src/worker/sites/cache.ts` could pass Worker typecheck while failing test
typecheck. Worker/Sites tests now use `tests/tsconfig.worker.json`, but if this
change is ever revisited, a local cast would keep the Cloudflare-only assumption
explicit if this code is imported from a DOM-enabled test. This shape compiles
cleanly across both configs:

```ts
type CloudflareCacheStorage = CacheStorage & { readonly default: Cache };

export function getDefaultSitesCache(): Cache {
  return (caches as CloudflareCacheStorage).default;
}
```

Do not edit `worker-configuration.d.ts`; it is generated. Do not add a global
augmentation unless more files need `caches.default`.

## Recommendation

First verify whether D1 read replication is enabled and collect production
histograms for `site_page_lookup`, `cache_read`, total Worker time, and full
TTFB. The Lighthouse run and repeated headers show good page scores but variable
document latency.

Keep the current named Cache API namespace: `caches.open("sites:v1")`.

If the product accepts stale public HTML, implement Option B for HTML only:
request-keyed Cache API before D1, short TTL, cache tags, purge in background,
and no pre-D1 asset caching in the first pass.

## Implementation note: Option B without explicit purge

The 2026-05-19 implementation uses the Option B request-keyed HTML cache path
with a fixed 300 second internal TTL, but intentionally defers explicit
Cloudflare purge-by-tag calls. Internal cached HTML responses still carry
`Cache-Tag` values (`sites-html`, `site:<workspaceId>`, `page:<pageId>`, and
`root:<publishedRootId>`) so purge can be added later without changing the cache
entry shape.

This means TTL is the correctness boundary for public HTML staleness. The
subdomain middleware may still create a D1 session before route handling, but
the HTML cache-hit path must not invoke D1 methods. Public assets remain D1-first
and are not part of the pre-D1 HTML cache change.
