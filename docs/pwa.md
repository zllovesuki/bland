# bland PWA Readiness Investigation

Date: 2026-04-09

## Scope

This investigation answers a narrow question:

What does it take to make `bland` PWA-ready without expanding beyond the
current product spec?

The intended offline boundary is already defined in
[bland-production-spec.md](./bland-production-spec.md):

- `bland` supports per-document offline editing for previously visited pages
- `bland` does not support offline workspace mutations
- `bland` does not support full offline-first behavior
- workspace metadata is online-first with a stale local cache

So "PWA-ready" for `bland` should mean:

- installable on desktop and mobile
- launches in a standalone app window
- the SPA shell can boot offline
- previously visited pages can still load and edit offline
- reconnect sync still uses the existing Yjs merge path

It should not mean:

- offline create, move, delete, share, invite, search, or upload
- a new offline sync subsystem
- a second source of truth outside D1 + Durable Objects + client-local caches

## Current State In The Live Tree

The repo already implements most of the product-facing offline behavior once
the app is running.

### Already present

- Per-page Yjs persistence exists via `y-indexeddb` in
  [src/client/components/editor/editor-pane.tsx](../src/client/components/editor/editor-pane.tsx).
- Cached-doc hints exist in
  [src/client/lib/doc-cache-hints.ts](../src/client/lib/doc-cache-hints.ts)
  and are used to distinguish "previously visited" pages from pages that do
  not have local document data yet.
- Workspace state is persisted with Zustand `persist` in
  [src/client/stores/workspace-store.ts](../src/client/stores/workspace-store.ts).
- Startup falls back to `LOCAL_ONLY` when refresh fails due to network or
  transport issues in
  [src/client/main.tsx](../src/client/main.tsx) and
  [src/client/lib/api.ts](../src/client/lib/api.ts).
- Session rehydration already retries refresh when connectivity returns in
  [src/client/hooks/use-session-rehydration.ts](../src/client/hooks/use-session-rehydration.ts).
- Page loading already tries the API first, then falls back to cached page
  metadata and local Yjs state in
  [src/client/components/page-view.tsx](../src/client/components/page-view.tsx).
- The root route already has a cached-workspace recovery path through
  [src/client/components/empty-workspace-view.tsx](../src/client/components/empty-workspace-view.tsx)
  and
  [src/client/lib/root-workspace-gateway.ts](../src/client/lib/root-workspace-gateway.ts).
- Offline UI indicators already exist:
  - banner in
    [src/client/components/app-shell.tsx](../src/client/components/app-shell.tsx)
  - sync-status dot in
    [src/client/components/presence/sync-status.tsx](../src/client/components/presence/sync-status.tsx)
  - disabled online-only actions in the sidebar and page actions
- Explicit logout already clears local auth state, cached-doc hints, and
  persisted workspace state in
  [src/client/hooks/use-auth.ts](../src/client/hooks/use-auth.ts) and
  [src/client/stores/auth-store.ts](../src/client/stores/auth-store.ts).
- Cache ownership validation already clears cached workspace data and local Yjs
  docs when the cached user changes in
  [src/client/stores/workspace-store.ts](../src/client/stores/workspace-store.ts).
- The deployed app already has SPA navigation fallback at the edge via
  [wrangler.jsonc](../wrangler.jsonc).

This means `bland` is already close to the spec's offline document behavior
after initial load.

### Still missing

The browser-facing PWA layer is still absent.

- No `manifest.webmanifest`
- No install icon set
- No browser service worker file
- No service worker registration in the client
- No PWA plugin or service-worker build wiring in
  [vite.config.ts](../vite.config.ts)
- No standalone install metadata in
  [index.html](../index.html)
- No `<meta name="theme-color" ...>` in
  [index.html](../index.html)
- No tracked favicon or app icon asset, even though
  [index.html](../index.html) references `/favicon.svg`
- No last-page or last-route restore for offline cold start

The tracked `public/` directory is also empty today.

The current build still succeeds without these assets, so this is an
installability gap rather than a current build blocker.

## Main Gaps

### 1. No install metadata or tracked browser assets

[index.html](../index.html) sets the page title, a favicon link, and Google
Fonts, but it does not link a web app manifest or any install metadata. There
is also no tracked icon or favicon asset anywhere in the repo today.

Minimum missing pieces:

- `manifest.webmanifest`
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<meta name="theme-color" ...>`
- app icons, including a maskable icon

### 2. No browser service worker

The Cloudflare Worker in
[src/worker/index.ts](../src/worker/index.ts) is server infrastructure, not a
browser service worker.

Right now there is:

- no client-side `navigator.serviceWorker.register(...)`
- no generated or hand-written service worker entry
- no build-time precache manifest wiring

That means:

- the app shell is not cached for offline launch
- an installed copy would not reliably cold-start offline
- visited docs may be available once the app is running, but the app itself is
  not yet an offline-resilient installed shell

### 3. Offline cold start is partially covered, but not finished

The current root flow is better than a hard live-only bootstrap.

The `/` entry path already uses
[src/client/lib/root-workspace-gateway.ts](../src/client/lib/root-workspace-gateway.ts)
to redirect into a cached workspace when the API is unreachable and a persisted
workspace is available.

But the cold-start experience is still incomplete:

- there is no persisted "last useful route" or last opened page
- offline launch depends on having enough persisted workspace state to recover
- direct page reopen still depends on both cached page metadata and a local Yjs
  document
- if there is no cached workspace to recover, `/` falls into the unavailable
  state instead of reopening the last page

So the remaining launch gap is not "root is live-only". It is "the app cannot
yet deliberately restore the last useful page when launched offline".

### 4. Media is not explicitly covered by offline caching

Previously visited page text is already backed by local Yjs persistence, but
page covers and inline images still resolve to network URLs:

- [src/client/components/ui/page-cover.tsx](../src/client/components/ui/page-cover.tsx)
- [src/client/components/editor/extensions/image-node.tsx](../src/client/components/editor/extensions/image-node.tsx)

Uploads are served from same-origin authenticated routes in
[src/worker/routes/uploads.ts](../src/worker/routes/uploads.ts), and successful
responses already send:

- `Cache-Control: private, max-age=31536000, immutable`

But nothing in the browser is currently taking advantage of that for offline
boot or runtime caching. If `bland` wants visited pages with images to render
fully offline, the browser service worker should cache same-origin
`GET /uploads/:id` responses after they have been fetched once.

Without that, offline page rendering still works for text, but some media will
disappear when the network is gone.

### 5. Fonts are still network-dependent

[index.html](../index.html) currently loads fonts from Google Fonts. That does
not block PWA installability, but it reduces offline fidelity and adds an
external dependency to the app shell.

For the smallest acceptable implementation, this can stay as-is initially if
system fallback fonts are acceptable offline. If visual fidelity matters, the
fonts should be self-hosted.

### 6. Browser-cache invalidation does not exist yet

`bland` already clears local auth and document/workspace caches on explicit
logout or cached-user changes.

What does not exist yet is browser-cache invalidation for service-worker caches,
because there is no service worker today. Once a browser PWA layer is added,
the behavior should be intentional:

- logout should best-effort clear browser caches owned by the current user
- user-switch should clear caches keyed to the previous user
- revocation can continue to follow the existing v1 local-cache tradeoff from
  the product spec

## Recommended Minimum Implementation

The smallest implementation that matches the current spec is still a thin
browser-PWA layer on top of the existing offline document strategy.

### 1. Add manifest and actual icon assets

Add a root-served `manifest.webmanifest` with:

- `name: "bland"`
- `short_name: "bland"`
- `start_url: "/"`
- `scope: "/"`
- `display: "standalone"`
- `background_color` matching the app background
- `theme_color` matching the app chrome
- at least one 192x192 icon
- at least one 512x512 icon
- at least one `purpose: "maskable"` icon

Also update `index.html` to link the manifest and theme color, and replace the
current unresolved `/favicon.svg` reference with a real tracked asset.

### 2. Add a browser service worker

Use a browser service worker to make the app shell boot offline.

Recommended cache policy:

- precache the built SPA shell assets
- precache the manifest and icons
- navigation requests: network-first with offline fallback to `index.html`
- same-origin static assets: stale-while-revalidate or cache-first
- `/api/*`: network-only
- `/parties/*`: do not cache
- `/uploads/*` `GET`: defer to a later phase unless visited-media caching is
  explicitly included

### 3. Add last useful route restore

Persist the last successfully opened workspace/page, or at minimum the last
page id plus workspace slug, and use that during offline startup.

That lets an installed app reopen to the last useful screen instead of relying
only on cached workspace recovery from `/`.

### 4. Extend existing logout and user-switch cleanup to browser caches

When the user logs out or the cached workspace owner changes:

- keep the existing local state cleanup
- additionally clear service-worker caches that contain authenticated media or
  app data
- keep this best-effort, matching the current local-cache model

## Recommended Tooling

Follow the repo's "less code" rule.

Start with `vite-plugin-pwa` using `generateSW`, not a hand-written service
worker.

Why:

- the plugin is not installed or configured today
- Vite already owns the build output and hashed asset graph
- `bland` only needs a modest runtime caching policy
- this is likely less code than maintaining a custom service worker by hand

Only move to `injectManifest` if `bland` later needs more custom service worker
logic than `generateSW` can express cleanly.

## What Should Stay Out Of Scope

Do not expand the implementation to include:

- offline page creation
- offline page moves or archive actions
- offline search
- offline uploads
- background sync queues for workspace mutations
- push notifications
- a second offline database for workspace metadata

Those are separate product decisions and are not required by the current spec.

## Suggested Rollout

### Phase 1

Make `bland` installable.

- add manifest
- add actual icon assets
- link metadata in `index.html`
- register the browser service worker

### Phase 2

Make the installed app boot offline.

- precache shell assets
- add navigation fallback to the SPA shell
- verify standalone launch works offline

### Phase 3

Improve previously visited page fidelity offline.

- persist and restore the last useful route
- optionally cache same-origin upload `GET` responses for visited media
- clear browser caches on logout and user switch

## Verification Checklist

- Install `bland` on desktop Chrome and on mobile Chrome/Safari home screen
- Launch the installed app and confirm it opens in standalone mode
- Open `/` online, then relaunch offline and confirm cached workspace recovery
  still redirects when local workspace state exists
- Launch `/` offline with no cached workspace and confirm the unavailable state
  is explicit
- Visit a page online, reload offline, and confirm the page still opens if it
  was previously visited
- Edit a previously visited page offline and confirm changes merge on reconnect
- Try to open a never-visited page offline and confirm the failure is explicit
- Confirm page create/archive/share/search remain disabled or unavailable
  offline
- If visited-media caching is implemented, visit a page with uploaded media, go
  offline, and confirm the media still renders after the page has been fetched
  once
- Confirm explicit logout clears current local state today, and browser caches
  too once a service worker exists

## Decision

`bland` still does not need a broad offline-first redesign to become
PWA-ready.

It needs a thin browser-PWA layer on top of the current offline document
strategy:

- manifest
- icons
- browser service worker
- offline app-shell caching
- last-route restore
- optional visited-media caching

That remains the smallest implementation that matches both the current product
spec and the live codebase.

## Live Tree References

Verified against:

- [docs/bland-production-spec.md](./bland-production-spec.md)
- [index.html](../index.html)
- [vite.config.ts](../vite.config.ts)
- [wrangler.jsonc](../wrangler.jsonc)
- [src/client/main.tsx](../src/client/main.tsx)
- [src/client/lib/api.ts](../src/client/lib/api.ts)
- [src/client/lib/doc-cache-hints.ts](../src/client/lib/doc-cache-hints.ts)
- [src/client/lib/root-workspace-gateway.ts](../src/client/lib/root-workspace-gateway.ts)
- [src/client/hooks/use-auth.ts](../src/client/hooks/use-auth.ts)
- [src/client/hooks/use-session-rehydration.ts](../src/client/hooks/use-session-rehydration.ts)
- [src/client/stores/auth-store.ts](../src/client/stores/auth-store.ts)
- [src/client/stores/workspace-store.ts](../src/client/stores/workspace-store.ts)
- [src/client/components/app-shell.tsx](../src/client/components/app-shell.tsx)
- [src/client/components/empty-workspace-view.tsx](../src/client/components/empty-workspace-view.tsx)
- [src/client/components/page-view.tsx](../src/client/components/page-view.tsx)
- [src/client/components/editor/editor-pane.tsx](../src/client/components/editor/editor-pane.tsx)
- [src/client/components/editor/extensions/image-node.tsx](../src/client/components/editor/extensions/image-node.tsx)
- [src/client/components/ui/page-cover.tsx](../src/client/components/ui/page-cover.tsx)
- [src/client/components/presence/sync-status.tsx](../src/client/components/presence/sync-status.tsx)
- [src/worker/routes/uploads.ts](../src/worker/routes/uploads.ts)
