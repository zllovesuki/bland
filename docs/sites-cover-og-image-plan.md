# Sites cover Open Graph image plan

Status: decision complete

## Objective

Add public Open Graph images for bland Sites page covers.

Public HTML should emit `og:image` and `og:image:type` when the current cover can
produce a safe public image. Generated gradient images are fixed at `1200x630`
PNG and also emit `og:image:width=1200` and `og:image:height=630`.

Do not render WASM images in the public request path.

## Core Decision

Add a Sites route before the generic asset route:

```text
GET /_assets/:pageId/cover
GET /_assets/:pageId/:uploadId
```

The cover route is D1-first:

1. Resolve the host, site, and page through the existing Sites publication path.
2. Return 404 for unpublished, archived, missing, wrong-workspace, non-doc, or
   otherwise invalid pages.
3. Only after D1 resolution, read uploads R2, read `SITES` R2, or enqueue repair.

Generated gradient covers are written asynchronously by `TASKS_QUEUE` to:

```text
<workspaceId>/<pageId>/cover.png
```

The fixed key is valid only when object metadata matches the current cover:

```text
cover_hash = <hash>
cover_url = <page.cover_url>
width = 1200
height = 630
```

HTML uses a versioned URL:

```text
https://<site-host>/_assets/<pageId>/cover?v=<cover_hash>
```

If `v` is present and does not match the current cover hash, return 404.

## Behavior Matrix

| Current `cover_url`                               | HTML OG meta                        | Cover route                                             | Queue repair                        |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| `null`                                            | none                                | 404                                                     | no                                  |
| `/uploads/:id`, OG-safe type, current page upload | `og:image` + type                   | stream uploads R2 object                                | no                                  |
| `/uploads/:id`, HEIC/PDF/other unsafe type        | none                                | 404                                                     | no                                  |
| shared gradient preset                            | `og:image`, `image/png`, dimensions | serve matching `SITES` artifact, or 503 while repairing | yes, only if artifact missing/stale |
| `linear-gradient(...)` not in shared presets      | none                                | 404                                                     | no                                  |
| malformed/other string                            | none                                | 404                                                     | no                                  |
| old version URL after cover changed               | stale HTML may still reference it   | 404                                                     | no                                  |

For a repairable generated cover miss, return:

```text
503
Cache-Control: no-store
Retry-After: 5
```

For successful cover responses:

- matching `v`: `Cache-Control: public, max-age=31536000, immutable`
- no `v`: `Cache-Control: public, max-age=300, must-revalidate`

## Important Constraints

- Public Sites HTML already accepts bounded staleness. Stale HTML may reference
  an old cover hash; do not store historical cover PNGs to support it.
- D1 remains the public reachability authority. Never serve a `SITES` or uploads
  object before resolving the published page.
- Request-path repair must be impossible for doomed covers. Only shared gradient
  presets that pass the parser may enqueue `site-cover`.
- The queue handler also reads current D1 state and no-ops unsupported current
  covers without retry.
- Queue delivery is at least once. Duplicate `site-cover` messages rewrite the
  same fixed R2 key and are harmless.
- Workspace Sites cleanup already deletes by `<workspaceId>/` prefix, so it will
  delete generated cover PNGs.

## Implementation Plan

### 1. Shared Cover Presets

Move `GRADIENT_PRESETS` from `src/client/components/cover-picker.tsx` to:

```text
src/shared/page-cover.ts
```

This matches the existing top-level shared domain primitive pattern
(`page-id.ts`, `site-slug.ts`). Do not put this in `src/shared/sites`; covers
are page metadata used by both the app UI and public Sites.

Keep the module Worker-safe:

```ts
export const GRADIENT_PRESETS = [...] as const;
export type GradientPreset = (typeof GRADIENT_PRESETS)[number];
export function isGradientPreset(value: string): value is GradientPreset;
```

Use it in `CoverPicker`, `PATCH` validation, gradient parser tests, and queue
tests.

### 2. Dependency

Use `@cf-wasm/png`, not `@cf-wasm/og`.

Reason: this task only needs PNG encoding for a rasterized gradient rectangle.
`@cf-wasm/og` is for HTML/CSS OG cards, pulls satori/resvg/html-to-react, and
warns about breaking changes outside strict SemVer.

Install with lifecycle scripts disabled:

```text
npm install --ignore-scripts @cf-wasm/png
```

In the queue renderer, dynamically import:

```ts
const { encode } = await import("@cf-wasm/png/workerd");
```

Only add `@cf-wasm/plugins` if Vite/Vitest/Wrangler cannot resolve the `.wasm`
module import from `@cf-wasm/png/workerd`.

### 3. Cover Helper

Add `src/worker/sites/cover.ts` for the cover-specific logic:

- `buildSiteCoverR2ObjectKey(workspaceId, pageId)`
- `createSiteCoverHash(coverUrl)`
- `parseUploadCoverUrl(coverUrl)`
- `parseSupportedLinearGradient(coverUrl)`
- `isOgSafeUploadContentType(contentType)`
- `resolveSiteOgCoverMeta(db, page, canonicalUrl)`
- `serveSiteCover(args)`
- `enqueueSiteCover(env, pageId)`

Hash input should include at least:

```ts
{
  version: "site-cover:v1",
  width: 1200,
  height: 630,
  coverUrl: page.cover_url
}
```

Use the existing SHA-256/base64url style from `createRenderDependencyHash` if it
can be shared cleanly.

OG-safe uploaded cover types:

```text
image/png
image/jpeg
image/webp
image/gif
```

### 4. Gradient Renderer

Support only the preset subset:

```text
linear-gradient(<angle>deg, <hex-color> <percent>%, ...)
```

Requirements:

- angle in degrees
- two or more stops
- colors are `#rgb` or `#rrggbb`
- positions are explicit percentages
- positions clamp to 0 through 100 and sort before rendering

Rasterize `1200 * 630 * 4` RGBA bytes, interpolate stops in byte-space sRGB,
and encode with `@cf-wasm/png/workerd`.

### 5. Queue Work

Extend `TasksQueueMessage`:

```ts
export type TasksQueueMessage =
  | { type: "index-page"; pageId: string }
  | { type: "page-projection"; pageId: string }
  | { type: "workspace-sites-cleanup"; workspaceId: string }
  | { type: "site-cover"; pageId: string };
```

Add `src/worker/queues/site-cover.ts`:

- read D1 with `createSessionDb(env.DB, "first-primary")`
- retry only when the page is not yet visible
- skip non-doc, null, upload, non-preset gradient, parser-rejected gradient, and
  unsupported covers without retry
- render supported preset gradients and write `SITES` cover metadata

Update `src/worker/index.ts` queue dispatch and log context.

### 6. Metadata Write Path

Update `PATCH /workspaces/:wid/pages/:id` in `src/worker/routes/pages.ts`:

- accept `null`
- accept `/uploads/:id`
- accept only `linear-gradient(...)` values present in shared
  `GRADIENT_PRESETS`
- reject all other cover values
- after a successful `cover_url` update, best-effort enqueue `site-cover`

This prevents new arbitrary gradients from creating pathological request-path
repair.

### 7. Public Route

Update `src/worker/sites/router.ts`:

- add `COVER_ASSET_ROUTE` before `ASSET_ROUTE`
- reject apex hosts
- call existing `resolveCurrentSitePage(c, pageId)` before any object read
- delegate to `serveSiteCover`

Keep `serveSiteAsset` for generic `/_assets/:pageId/:uploadId` behavior.

### 8. HTML Metadata

Resolve OG cover metadata while rendering Sites HTML. Do not check that a
generated gradient PNG already exists before emitting the HTML meta URL.

For uploads, perform the small D1 `uploads` check only when the cover is
`/uploads/:id`. For gradients, use the shared preset predicate and cover hash.

Pass resolved fields through the Sites React render context into `SiteHead`.

## Files To Touch

- `src/shared/page-cover.ts`
- `src/client/components/cover-picker.tsx`
- `src/worker/sites/cover.ts`
- `src/worker/queues/messages.ts`
- `src/worker/queues/site-cover.ts`
- `src/worker/index.ts`
- `src/worker/routes/pages.ts`
- `src/worker/sites/router.ts`
- `src/worker/sites/render-page-stream.tsx`
- `src/sites/react-render-context.ts`
- `src/sites/types.ts`
- `src/sites/document.tsx`
- `package.json` and lockfile

## Tests

Add focused coverage:

- cover helper unit tests
  - hash changes on cover/version inputs
  - upload parser accepts only `/uploads/:id`
  - OG-safe type helper rejects HEIC/PDF
  - parser accepts every shared preset
  - parser rejects non-preset or unsupported CSS
- queue runtime tests
  - missing page retries
  - supported preset writes `<workspaceId>/<pageId>/cover.png`
  - object has `image/png` and expected custom metadata
  - PNG bytes start with the PNG signature
  - null, upload, non-preset gradient, unsupported gradient, and canvas no-op
- route runtime tests
  - upload cover serves only current page/workspace upload
  - unsafe upload type returns 404
  - unpublished page returns 404 before R2
  - matching generated artifact serves
  - missing/stale generated artifact returns 503 and enqueues repair
  - old `v` returns 404
  - generic asset route still works
- page PATCH tests
  - accepts shared gradient preset
  - rejects arbitrary non-preset `linear-gradient(...)`
  - still accepts null and `/uploads/:id`
- Sites HTML tests
  - emits absolute versioned `og:image`
  - emits `og:image:type`
  - emits dimensions for gradients
  - omits `og:image` for unsupported covers

Run:

```text
npm run typecheck
npm run lint
npm run build
npm run test:worker-unit -- tests/worker/sites/cover.test.ts
npm run test:worker-runtime -- tests/worker/queues/site-cover.workers.test.ts tests/worker/sites/asset-gate.workers.test.ts tests/worker/sites/dispatch.workers.test.ts
```

`npm run typecheck` and `npm run build` run `emoji:generate` through existing
`pre*` scripts. `npm run lint` does not. Focused `test:*` scripts do not run the
broad `pretest` hook; run `npm run emoji:generate` first if generated emoji data
is missing.

## Code And Dependency Context Checked

- `src/worker/sites/router.ts`
- `src/worker/sites/assets.ts`
- `src/worker/sites/cache.ts`
- `src/worker/sites/render-page-stream.tsx`
- `src/sites/document.tsx`
- `src/worker/routes/pages.ts`
- `src/worker/routes/uploads.ts`
- `src/worker/queues/messages.ts`
- `src/worker/queues/page-projection.ts`
- `src/worker/index.ts`
- `src/client/components/cover-picker.tsx`
- `wrangler.jsonc`
- `github.com/fineshopdesign/cf-wasm`
- `@cf-wasm/png`
- `@cf-wasm/og`
- `@cf-wasm/plugins`

## Addendum: Uploaded Cover OG Derivatives

Status: research complete; implementation requested as a plan update.

This addendum supersedes the upload-cover behavior in the original matrix where
uploaded covers are streamed directly from uploads R2. Uploaded page covers
should instead produce the same fixed-size public OG artifact shape as generated
gradient covers when Cloudflare Images binding is available.

### Decision

Use the Cloudflare Images binding for uploaded cover derivatives, not a custom
WASM decoder/resizer stack.

Reasoning:

- Cloudflare Images binding can transform image bytes from a `ReadableStream`,
  including a private R2 object body, without exposing the original upload URL.
- It supports resize/crop/encode operations that match this task directly.
- It avoids adding JPEG/WebP/GIF decoding dependencies to the Worker bundle and
  avoids Worker memory risk from manual full-image decode paths.
- It keeps D1 as the public reachability authority and preserves the existing
  derived-artifact model in the `SITES` bucket.

Relevant Cloudflare docs:

- `https://developers.cloudflare.com/images/optimization/transformations/bindings/`
- `https://developers.cloudflare.com/images/optimization/features/`

### Semantics

The generated upload cover artifact should be:

```text
1200x630
image/png
fit = cover
gravity = center
anim = false
```

This matches the current cover positioning rule, not a specific viewport crop:

- the app cover uses `object-cover` centered image rendering
- public Sites uses `bg-cover bg-center`

Because the page cover width is responsive and the Sites page cover is `h-48`,
there is no single exact browser viewport crop to reproduce. The invariant is
the shared crop rule: fill the target rectangle and center-crop the source.

If exact author-controlled positioning is needed later, add persisted focal
point metadata and apply it in both CSS cover rendering and Cloudflare Images
`gravity: { x, y }`. Do not add that in this change unless explicitly requested.

### Wrangler Binding

Add the Images binding to `wrangler.jsonc`:

```jsonc
"images": {
  "binding": "IMAGES"
}
```

Regenerate `worker-configuration.d.ts` through the repo's existing Wrangler type
generation flow after editing `wrangler.jsonc`.

### Hash And Key

Keep using the fixed cover artifact key:

```text
<workspaceId>/<pageId>/cover.png
```

Expand the hash input so uploaded cover artifacts change when the upload identity
or output transform contract changes:

```ts
{
  version: "site-cover:v2",
  width: 1200,
  height: 630,
  fit: "cover",
  gravity: "center",
  format: "image/png",
  anim: false,
  coverUrl: page.cover_url
}
```

The upload id is already embedded in `coverUrl` as `/uploads/:id`. Do not hash
the original object bytes in the request path. If an uploaded object is replaced
in the future, that should be represented by immutable upload ids or a separate
version field, not by reading blob bytes during public HTML rendering.

Store the same metadata as gradients, with optional source metadata for
diagnostics:

```text
cover_hash = <hash>
cover_url = <page.cover_url>
width = 1200
height = 630
source = upload | gradient
```

### Queue Behavior

Update `site-cover` queue handling:

1. Read current page state from D1 with a primary read, as planned.
2. Skip null, archived, non-doc, unsupported, or missing covers fail-closed.
3. For gradient presets, keep the existing gradient renderer path.
4. For `/uploads/:id`, resolve the upload row through D1:
   - `uploads.id = uploadId`
   - `uploads.workspace_id = page.workspace_id`
   - `uploads.page_id = page.id`
   - `uploads.content_type` is OG-safe input
5. Read the original object from uploads R2 only after the D1 checks pass.
6. Transform the private R2 stream with Images binding.
7. Write the transformed PNG to `SITES` at the fixed cover key with current
   cover metadata.

Sketch:

```ts
const result = await env.IMAGES.input(object.body)
  .transform({
    width: SITE_COVER_WIDTH,
    height: SITE_COVER_HEIGHT,
    fit: "cover",
    gravity: "center",
  })
  .output({
    format: "image/png",
    anim: false,
  });

await env.SITES.put(key, result.image(), {
  httpMetadata: { contentType: "image/png" },
  customMetadata,
});
```

If the Images binding throws for an otherwise valid uploaded image, return a
retry result for transient transformation failures. For deterministic unsupported
input, log and no-op. Prefer classifying by known Images error codes only if the
current generated types or docs expose stable codes; otherwise keep the failure
classification conservative and bounded by queue retry policy.

### Public Route Behavior

`serveSiteCover` should no longer stream upload originals for OG covers. It
should serve only the matching `SITES` cover artifact for both gradients and
uploaded covers.

For repairable misses:

- gradient preset current cover: enqueue repair, return 503
- upload current cover with safe upload row: enqueue repair, return 503

For doomed covers:

- missing upload row, wrong workspace, wrong page, unsafe type, missing R2 object:
  return 404 and do not enqueue repeated doomed repair from the public route

Keep the D1-first invariant: no R2 or `SITES` object read before resolving the
published page and current cover authority through D1.

### HTML Metadata

For uploaded covers that pass the D1 upload check, emit:

```text
og:image = https://<site-host>/_assets/<pageId>/cover?v=<cover_hash>
og:image:type = image/png
og:image:width = 1200
og:image:height = 630
```

This makes uploaded covers behave like gradient covers from the perspective of
social crawlers: fixed dimensions, stable content type, and hash-versioned URL.

### Behavior Matrix Amendment

Replace the upload rows in the original matrix with:

| Current `cover_url`                               | HTML OG meta                        | Cover route                                             | Queue repair                   |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `/uploads/:id`, OG-safe type, current page upload | `og:image`, `image/png`, dimensions | serve matching `SITES` artifact, or 503 while repairing | yes, if artifact missing/stale |
| `/uploads/:id`, HEIC/PDF/other unsafe type        | none                                | 404                                                     | no                             |

### Tests To Add Or Update

Add or update focused coverage:

- queue runtime tests
  - uploaded PNG/JPEG/WebP cover reads uploads R2 and writes `SITES` PNG
  - upload artifact has `image/png`, `width=1200`, `height=630`, `source=upload`
  - upload cover skips wrong page/workspace rows
  - unsafe upload type no-ops without `SITES` write
  - missing upload object no-ops or returns bounded retry according to the final
    failure classifier
- route runtime tests
  - uploaded cover no longer streams the original upload
  - matching uploaded derived artifact serves from `SITES`
  - missing/stale uploaded derived artifact enqueues repair and returns 503
  - doomed upload cover returns 404 without repair
- Sites HTML tests
  - uploaded cover emits versioned `og:image`
  - uploaded cover emits `image/png` type and fixed dimensions

Because the Images binding local test implementation may be lower fidelity than
production, mock or stub the binding narrowly in Worker runtime tests where
needed. Do not make tests depend on production Cloudflare image transformation
availability.
