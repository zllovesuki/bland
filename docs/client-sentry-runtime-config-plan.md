# Client-side Sentry Runtime Config Plan

## Summary

This plan covers **client-side Sentry only**. Worker-side Sentry is out of scope; Cloudflare Workers Observability remains the backend observability path.

The chosen approach is **runtime HTMLRewriter injection** that exposes public client config through the SPA shell:

- `turnstile_site_key`
- `sentry_dsn`

This keeps Worker `Env` as the source of truth for public runtime config, avoids spreading build-time public env vars across local machines and CI, and keeps client bootstrap on a single runtime path.

---

## Goals

- Add client-side Sentry without adding Worker-side Sentry.
- Keep `reportClientError` as the single vendor-neutral reporting entry point.
- Make Turnstile and Sentry read from the same public runtime config source.
- Avoid requiring `VITE_SENTRY_DSN` or `VITE_TURNSTILE_SITE_KEY` in every build environment.
- Avoid unnecessary platform complexity unless the benefit clearly justifies it.

---

## Current Constraints

- The SPA shell is served from static assets.
- In [wrangler.jsonc](../wrangler.jsonc), `run_worker_first` now covers all document routes except hashed assets under `/assets/*`.
- The Worker now has an `ASSETS` binding and document navigations pass through Worker code first.
- `TURNSTILE_SITE_KEY` already lives in Worker `Env`.
- `reportClientError` already exists as the intended vendor-neutral capture surface.
- React 19 is in use, so root-level error hooks are available in `createRoot(...)`.

---

## Options Explored

## 1. Build-time `import.meta.env`

### Shape

- `VITE_TURNSTILE_SITE_KEY`
- `VITE_SENTRY_DSN`

### Advantages

- Smallest implementation.
- Best fit for Sentry's recommended "initialize before the rest of the app" browser setup.
- No extra runtime request.
- No SPA shell or routing changes.

### Drawbacks

- Public config lives in a second channel outside Worker `Env`.
- Values are frozen into the built client bundle and require rebuilds to change.
- Public config has to exist anywhere production-like assets are built.
- This repo already has the Turnstile public key in Worker `Env`, so build-time injection would introduce config duplication immediately.

### Decision

Rejected. This is the smallest code diff, but it spreads public config into build infrastructure and moves `bland` away from Worker `Env` as the configuration source of truth.

---

## 2. Runtime HTMLRewriter injection

### Shape

- Add an `ASSETS` binding.
- Change SPA document routing to Worker-first.
- Fetch `/index.html` from `env.ASSETS`.
- Inject `window.__BLAND_PUBLIC_CONFIG__` into the shell with `HTMLRewriter`.

### Advantages

- Worker `Env` remains the single source of truth.
- No extra client fetch.
- Public config exists before app boot, which is the cleanest runtime fit for browser Sentry initialization.
- Turnstile and Sentry can share the same bootstrap object.
- Removes the startup/failure-recovery hazard of making auth and reporting depend on a separate config request.

### Drawbacks

- Requires changing `bland` from asset-first document serving to Worker-first document serving.
- Requires routing logic in `src/worker/index.ts` for shell requests and static file pass-through.
- Delivers client config through SPA shell transformation logic.
- Cloudflare documents this as a valid pattern, but it changes how every HTML navigation is served and should therefore remain tightly scoped.

### Decision

Chosen. The extra routing work is justified because it removes a hard bootstrap dependency while still keeping public config in Worker `Env`.

---

## 3. Runtime `/api/v1/config` endpoint

### Shape

- Add unauthenticated `GET /api/v1/config`.
- Return public config from Worker `Env`.
- Client fetches config at startup and auth pages reuse the same loader.

### Advantages

- Keeps Worker `Env` as the source of truth.
- No build-time `VITE_SENTRY_DSN` requirement.
- Matches the existing `bland` API architecture.
- Easy to test with focused worker and client unit tests.

### Drawbacks

- Adds one startup config request.
- Browser Sentry is not initialized at the exact first line of client code.
- Login and invite pages must wait for config before mounting Turnstile.
- Makes bootstrap and failure recovery depend on a second request path even though the data is already available synchronously in Worker `Env`.

### Decision

Rejected. This path worked mechanically, but the extra request was the wrong tradeoff once it became part of startup-critical bootstrap and auth recovery behavior.

---

## 4. Hybrid HTMLRewriter + `/api/v1/config`

### Shape

- Inject config into the shell when available.
- Fall back to `/api/v1/config` if bootstrap data is missing.

### Decision

Rejected as unnecessary complexity for v1. If the Worker bootstrap is missing, `bland` should treat that as a shell/bootstrap failure for that page load and should not carry a second config transport path.

---

## Chosen Design

### Public API

Inject:

```html
<script>
  window.__BLAND_PUBLIC_CONFIG__ = {
    turnstile_site_key: "1x00000000000000000000AA",
    sentry_dsn: null,
  };
</script>
```

Notes:

- `turnstile_site_key` is required.
- `sentry_dsn` is nullable so local and test environments can omit it.
- The bootstrap data is public and unauthenticated.
- The injected JSON should be escaped for inline-script safety.
- Shell caching is acceptable because these public config values change rarely; this design does not require overriding cache headers to `no-store`.

---

## Implementation Plan

## 1. Shared contract

Add a shared bootstrap schema in [src/shared/types.ts](../src/shared/types.ts):

- `PublicClientConfig`
  - `turnstile_site_key: string`
  - `sentry_dsn: string | null`

This keeps the public config shape typed on both the client and worker sides.

---

## 2. Worker shell bootstrap

Implement public-config bootstrap in the Worker shell path.

Behavior:

- Add `assets.binding = "ASSETS"` in [wrangler.jsonc](../wrangler.jsonc).
- Change `assets.run_worker_first` to `["/*", "!/assets/*"]`.
- Keep `not_found_handling = "single-page-application"`.
- In [src/worker/index.ts](../src/worker/index.ts):
  - keep `/parties/*` on Partyserver / DocSync routing
  - keep `/api/*` and `/uploads/*` on the existing Hono app path
  - pass direct non-HTML asset requests like `/favicon.svg` through `env.ASSETS.fetch(request)`
  - fetch the document request through `env.ASSETS` for document GET requests
  - inject `window.__BLAND_PUBLIC_CONFIG__` into `<head>` with `HTMLRewriter`

Environment changes:

- Add optional `SENTRY_DSN` to `.dev.vars.example`
- Regenerate `worker-configuration.d.ts`

This keeps public runtime config fully inside Worker `Env` while making it available before the client app boots.

---

## 3. Client config loader

Implement the client config module in `src/client/lib/client-config.ts` as a synchronous bootstrap reader.

Responsibilities:

- Read `window.__BLAND_PUBLIC_CONFIG__`
- Parse it once with the shared schema
- Cache the parsed result or parse error for the lifetime of the page
- Expose:
  - `getClientConfigSnapshot(): PublicClientConfig | null`
  - `getClientConfigErrorSnapshot(): Error | null`

This module becomes the shared path for:

- `main.tsx` bootstrapping
- Turnstile auth pages
- future client-side public config consumers

---

## 4. `reportClientError` and Sentry bootstrap

Expand [src/client/lib/report-client-error.ts](../src/client/lib/report-client-error.ts) into the browser reporting control point.

Behavior:

- Always log to `console.error` for local debugging.
- Normalize `unknown` into a consistent error object.
- Keep the existing `source` + `context` call contract so product code stays vendor-neutral.
- Queue captured events until the lazy `@sentry/react` import finishes.
- If `sentry_dsn` is present:
  - lazily import `@sentry/react`
  - initialize Sentry once
  - flush queued events through Sentry
- If `sentry_dsn` is absent, or bootstrap config is missing/invalid:
  - remain console-only
  - clear any queued events because there is no Sentry destination for this page load

Filtering:

- Add a helper that declines expected API errors such as:
  - `validation_error`
  - `unauthorized`
  - `forbidden`
  - `not_found`
  - `turnstile_failed`
- Report only high-signal handled failures:
  - render crashes
  - unhandled promise rejections
  - bootstrap config failures
  - Turnstile script/render failures
  - swallowed background failures that currently disappear silently
  - unexpected 5xx/transport failures in selected UI flows

This keeps the integration Sentry-specific internally while preserving a vendor-neutral surface in app code.

---

## 5. Startup sequence

Update [src/client/main.tsx](../src/client/main.tsx).

Boot order:

1. Register early global listeners:
   - `window.addEventListener("error", ...)`
   - `window.addEventListener("unhandledrejection", ...)`
2. Read `window.__BLAND_PUBLIC_CONFIG__` synchronously through `client-config.ts`.
3. Prime the reporter immediately from that bootstrap config.
4. Start the existing session refresh bootstrap.
5. Render the app after the current auth bootstrap completes.

React 19 root error hooks:

- Use `createRoot(..., { onUncaughtError, onCaughtError, onRecoverableError })`
- Each hook calls `reportClientError(...)`
- Do not wire `createRoot(...)` directly to Sentry-specific helpers; keep it going through the local abstraction
- Treat the root hooks as the reporting path for React render errors. Existing local `ErrorBoundary` components remain responsible for scoped fallback UI, not duplicate reporting.

This preserves the current startup model while still capturing early client failures through the local queue.

---

## 6. Turnstile integration

Replace the current `import.meta.env`-backed constant in [src/client/lib/constants.ts](../src/client/lib/constants.ts).

Changes:

- Remove `TURNSTILE_SITE_KEY` from static client constants.
- Make login and invite flows read the site key from the synchronous bootstrap reader.
- Update:
  - [src/client/components/auth/login-page.tsx](../src/client/components/auth/login-page.tsx)
  - [src/client/components/auth/invite-page.tsx](../src/client/components/auth/invite-page.tsx)
  - [src/client/components/auth/turnstile-widget.tsx](../src/client/components/auth/turnstile-widget.tsx)

UI behavior:

- If bootstrap config is present, auth pages mount Turnstile immediately.
- If bootstrap config is missing or invalid, show a clear inline error and do not attempt to mount Turnstile.
- The auth UI should offer reload and should not background-retry config.
- `TurnstileWidget` should call `reportClientError(...)` on:
  - script load failure
  - missing `window.turnstile` after script load
  - widget render failure

This aligns Turnstile with the same public config path as Sentry.

---

## 7. Client caller sites to update

Keep reporting focused on high-signal failures rather than every user-facing error toast.

Update these sites:

- [src/client/components/error-boundary.tsx](../src/client/components/error-boundary.tsx)
  - replace `console.error(...)` with `reportClientError(...)`
- [src/client/components/editor/editor-pane.tsx](../src/client/components/editor/editor-pane.tsx)
  - keep the existing schema mismatch reporting
- [src/client/components/page-view.tsx](../src/client/components/page-view.tsx)
  - report unexpected page load failures after expected offline/auth/cache branches are excluded
  - report unexpected optimistic metadata update failures for icon/cover changes
- [src/client/components/shared-page-view.tsx](../src/client/components/shared-page-view.tsx)
  - report unexpected share resolve failures
  - report the currently swallowed active-page load failure when a shared subpage fetch fails unexpectedly

Do not add `reportClientError(...)` to normal expected form/API failures in:

- `login-page.tsx`
- `invite-page.tsx`
- `workspace-settings.tsx`
- `profile-settings.tsx`
- `share-dialog.tsx`

Those flows already surface user-actionable errors and would mostly create noise.

---

## 8. Tests and verification

### Worker tests

Add focused worker tests covering:

- shell bootstrap injection into `/index.html`
- safe escaping of injected JSON
- routing splits for:
  - `/parties/*`
  - `/api/*`
  - `/uploads/*`
  - direct asset paths
  - document GET / HEAD requests

### Client tests

Add focused tests for:

- synchronous bootstrap parsing and memoization
- missing / invalid bootstrap handling
- `reportClientError` queueing and flush behavior during Sentry lazy-load
- filtering of expected vs high-signal errors

### Verification commands

- `npm run typecheck`
- `npm run test`
- `npm run build`

---

## Assumptions

- Worker-side Sentry remains out of scope.
- `SENTRY_DSN` is optional in local/test environments.
- `reportClientError` remains the only app-level error reporting API.
- Worker-first shell delivery is acceptable here because it removes a startup-critical config fetch and does not change hashed asset delivery.
- Missing earliest possible pre-module capture is still an acceptable tradeoff; the important change is eliminating the separate runtime config request from bootstrap.

---

## Final Decision Rationale

HTMLRewriter-based shell bootstrap is the best balance of correctness, operational simplicity, and platform safety for `bland`.

It keeps public runtime config in Worker `Env` and avoids duplicating it in build-time `VITE_*` variables.

It gives the browser the public config it needs before the client app starts, without adding a second runtime config transport.

It does add routing logic to the Worker shell path, but that complexity stays localized and keeps bootstrap behavior explicit and deterministic.
