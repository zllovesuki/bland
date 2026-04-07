# AGENTS.md

## One Rule To Remember

"Can we do more with less code?"

`bland-production-spec.md` is explicit about this and the repo should follow it. Prefer the smallest correct implementation that preserves correctness, performance, and security. If a larger abstraction or refactor is optional, present it as an option instead of making it the default.

## Naming

- The product name is `bland`, always lowercase.
- Do not describe `bland` as "Notion" or "a Notion clone" in code, comments, docs, or user-facing copy.

## Repository Status

- This repository is still greenfield, but it is no longer just the initial scaffold.
  Auth/workspace/page flows, share links, uploads, collaborative editing, and queue-driven search indexing all exist in the live tree today.
- The production spec is ambitious and intentionally ahead of the current implementation in several areas.
- Write changes against the live source tree, not the spec alone.
- Expect core architecture to remain stable:
  React SPA + Cloudflare Worker API + D1 as primary structured store + Durable Objects for doc sync + R2 for uploads + Queues for derived search indexing.
- Expect many v1 features to be partially implemented or stubbed today.
  `DocSync` is implemented in [src/worker/durable-objects/doc-sync.ts](/home/vendetta/code/bland/src/worker/durable-objects/doc-sync.ts) as a `YServer` subclass with snapshot persistence (`onLoad`/`onSave`).
  Queue consumption is implemented for FTS5 search indexing (`src/worker/queues/search-indexer.ts`).
  The schema already includes tables for snapshots, shares, and uploads even where full behavior is not wired yet.
- The live editor is a custom Tiptap/ProseMirror implementation under `src/client/components/editor/`. Treat older BlockNote references in docs as stale unless they are explicitly called out as historical or planned.

## Source Of Truth

- The current source tree wins when it conflicts with docs.
- `bland-production-spec.md` is the product and architecture reference.
- `frontend-spec.md` is the frontend reference design to keep consistent across `devbin.tools` products.
- `src/shared/types.ts` is the shared client/worker contract surface for public API shapes.
- `src/shared/doc-messages.ts` is the shared client/worker contract surface for DocSync custom messages. Update it when changing custom message payloads.
- `src/worker/db/schema.ts` is the schema source of truth. Do not hand-edit generated SQL in `drizzle/`.
- `wrangler.jsonc` is the runtime binding contract for D1, R2, Queues, Durable Objects, and rate limits.

## Working Rules

- Keep edits scoped and minimal.
- Prefer explicit code over clever code. Small duplication is acceptable when it keeps ownership and behavior obvious.
- Reuse existing helpers, stores, contracts, and route patterns before adding new ones. When adding new code, check the lists below and use what exists before introducing anything new.
- Do not broaden the implementation toward the full production spec unless the task requires it.
- Preserve the split between `src/client`, `src/worker`, and `src/shared`.
- If request or response shapes change, update both the worker route and [src/shared/types.ts](/home/vendetta/code/bland/src/shared/types.ts).
- Multiple agents may be working in parallel. Do not revert unrelated changes.
- Assume the dev server may already be running. Do not start `npm run dev` unless the user asks or the task clearly requires it.

## Existing Helpers And Constants

Before writing new code, check these files for reusable pieces:

### Worker constants (`src/worker/lib/constants.ts`)

- `ALLOWED_ORIGINS` — canonical origin list for CORS and WebSocket origin checks
- `JWT_ALGORITHM` — `"HS256"`, used everywhere JWTs are signed or verified
- `CF_IP_HEADER` — `"cf-connecting-ip"`, for rate limiting and Turnstile
- `DEFAULT_PAGE_TITLE` — `"Untitled"`, used in page creation and doc-sync title extraction
- `INVITE_EXPIRY_MS` — 7-day invite expiry duration

### Worker auth helpers (`src/worker/lib/auth.ts`)

- `getJwtSecret(env)` — encodes `JWT_SECRET` for jose. Use instead of inline `new TextEncoder().encode(...)`.
- `verifyAccessToken(token, env)` — verifies a JWT, rejects refresh tokens, returns `{ sub, jti }`. Use instead of inline `jwtVerify` calls.
- `createAccessToken(userId, env)` / `createRefreshToken(userId, env)` — issue JWTs.
- `setRefreshCookie(c, token)` / `clearRefreshCookie(c)` — manage the `bland_refresh` cookie.
- `parseCookies(header)` — parse a cookie header string.
- `hashPassword(password)` / `verifyPassword(password, stored)` — Argon2id.
- `toUserResponse(user)` — strip `password_hash` from a user row.
- `generateSecureToken()` — 32-byte base64url random token (for invite tokens, share tokens).
- `REFRESH_COOKIE` — the cookie name constant `"bland_refresh"`.

### Worker membership/permissions (`src/worker/lib/membership.ts`, `src/worker/lib/permissions.ts`)

- `checkMembership(db, userId, workspaceId)` — returns membership row or null.
- `requireMembership(c, db, userId, workspaceId, rejectGuest?)` — returns membership or sends 403 Response. Use this in route handlers to eliminate boilerplate null/guest checks.
- `canEdit(role)` — true for owner, admin, member.
- `isAdminOrOwner(role)` — true for owner, admin.

### Worker page helpers (`src/worker/lib/page-access.ts`, `src/worker/lib/page-tree.ts`)

- `getPage(db, pageId, workspaceId?)` — fetches a non-archived page row and optionally scopes it to a workspace.
- `validatePageMove(db, pageId, newParentId, workspaceId)` — checks self-parent, cycle, and max-depth violations before reparenting.
- `getPageAncestorChain(db, pageId, workspaceId)` — returns the ordered ancestor chain used by page-context/tree logic.

### Client constants (`src/client/lib/constants.ts`)

- `TURNSTILE_SITE_KEY` — from env or test fallback.
- `STORAGE_KEYS` — `{ D1_BOOKMARK, USER, LAYOUT, SIDEBAR }` for localStorage keys.

### Client helpers (`src/client/lib/api.ts`, `src/client/lib/permissions.ts`, `src/client/hooks/use-online.ts`, `src/client/hooks/use-role.ts`, `src/client/hooks/use-page-drag.ts`, `src/client/hooks/use-scroll-visibility.ts`)

- `toApiError(err)` — safely cast an unknown catch error to `ApiError`. Use instead of `err as ApiError`.
- `getMyRole(members, currentUser)` — resolves the current user's workspace role from the member list.
- `isAdminOrOwner(role)` — returns whether the current role is owner/admin.
- `canCreatePage(members, currentUser)` — returns whether the current user can create pages in the workspace.
- `canArchivePage(members, currentUser, page)` — returns whether the user can archive a page.
- `useOnline()` — shared browser online/offline signal for gating network-dependent UI.
- `useMyRole()` — derives `{ role, isOwner, isAdminOrOwner }` from the current auth/workspace stores.
- `usePageDrag(allPages)` / `computePosition(siblings, index)` / `isDescendant(allPages, draggedId, targetId)` — page-tree drag/drop helpers. Reuse these instead of duplicating tree move math in components.
- `useScrollVisibility(scrollElementId, threshold?)` — shared scroll-direction visibility hook used by the app header.

### Client UI primitives (`src/client/components/confirm.tsx`, `src/client/components/toast.tsx`, `src/client/components/ui/`)

- `Button` — shared button styling and variants. Prefer this over ad hoc button class strings for app UI actions.
- `Dialog` — shared modal shell with overlay, escape handling, and focus trap.
- `confirm(opts)` — promise-based confirmation modal for destructive or risky actions. `AppShell` already mounts `ConfirmContainer`.
- `toast.success/error/info()` — shared transient notifications. `AppShell` already mounts `ToastContainer`.
- `EmojiIcon` / `EmojiPicker` — shared emoji rendering and picker behavior for page/workspace icons.

## High-Level Architecture

### Frontend

- `src/client/main.tsx` boots the React 19 SPA and TanStack Router.
- `src/client/route-tree.tsx` is the route graph and current route-loading behavior.
- `src/client/components/` owns the app shell, auth pages, workspace layout, sidebar, and page views.
- `src/client/components/editor/` owns the custom Tiptap editor, uploads wiring, extension setup, and floating controller customization.
- `src/client/stores/` holds Zustand auth and workspace state.
- `src/client/lib/api.ts` is the centralized browser API client and D1 bookmark propagation point.

### Worker

- `src/worker/index.ts` is the Worker entrypoint, routes Partyserver WebSocket connections to `DocSync`, exports the `DocSync` Durable Object, and handles queue consumption.
- `src/worker/router.ts` wires Hono, CORS, D1 session handling, route registration, 404s, and top-level error handling.
- `src/worker/routes/` contains the current HTTP surface for auth, invites, workspaces, pages, page-tree, page-context, shares, uploads, search, and health.
- `src/worker/middleware/` owns auth, rate limiting, and Turnstile verification.
- `src/worker/db/schema.ts` defines the Drizzle schema for D1.

### Platform bindings

Configured in [wrangler.jsonc](/home/vendetta/code/bland/wrangler.jsonc):

- `DB`: D1 primary structured store
- `R2`: upload bucket
- `SEARCH_QUEUE`: queue producer/consumer for derived indexing work
- `DocSync`: Durable Object namespace for per-document sync (PascalCase name required by partyserver routing)
- `RL_AUTH`, `RL_API`: Cloudflare rate limiting bindings

## Important Invariants

- D1 is the source of truth for users, workspaces, memberships, page tree metadata, invites, shares, uploads, and persisted document snapshots.
- Live collaborative document state belongs in the per-document Durable Object when that feature is implemented. Do not move authoritative live document content into ad hoc worker globals or the client.
- Presence/cursor state is ephemeral. Do not persist it in D1 or R2.
- Search is a derived projection. Treat queue-driven indexing as rebuildable.
- R2 stores blobs, not authorization state. Access control must continue to come from D1-backed checks.
- D1 bookmark propagation is intentional. Preserve the `x-d1-bookmark` flow in [src/worker/router.ts](/home/vendetta/code/bland/src/worker/router.ts) and [src/client/lib/api.ts](/home/vendetta/code/bland/src/client/lib/api.ts) when changing request handling.
- Mutating requests should continue to prefer primary D1 reads. Do not accidentally regress read-after-write behavior.
- DocSync custom messages are a shared contract. Keep their JSON shapes centralized in [src/shared/doc-messages.ts](/home/vendetta/code/bland/src/shared/doc-messages.ts) instead of duplicating ad hoc payload parsing across client and worker code.
- Local Turnstile bypass is intentional in [src/worker/middleware/turnstile.ts](/home/vendetta/code/bland/src/worker/middleware/turnstile.ts). Do not extend that bypass to non-local environments. Localhost detection uses `isLocalRequestUrl` from `src/worker/http.ts` — use it instead of inline hostname checks.
- Refresh tokens live in the `bland_refresh` cookie and access tokens stay in client state. Keep auth changes aligned with that model unless the task explicitly changes it.

## Greenfield Guidance

- The schema and bindings were set up ahead of all feature work. A table or binding existing does not mean the full product flow exists yet.
- Favor incremental delivery over speculative framework-building.
- When implementing a feature from `bland-production-spec.md`, land the minimal vertical slice that matches the current repo style.
- If the spec and scaffold diverge, either:
  1. implement the smallest missing piece required by the task, or
  2. document the gap briefly and keep the change constrained.

## Database And Generated Files

- Update [src/worker/db/schema.ts](/home/vendetta/code/bland/src/worker/db/schema.ts) first for schema changes.
- Then run `npm run db:generate` to update `drizzle/`.
- Do not manually edit `drizzle/*.sql` unless the user explicitly asks for a hand-written migration.
- Review generated SQL before finishing. `drizzle/0000_watery_tattoo.sql` is the initial schema. `drizzle/0001_fts5_pages.sql` is a hand-written FTS5 migration outside Drizzle Kit's journal — see `src/worker/db/fts.ts` for the type-safe query shim.

## Validation

- For most code changes, run `npm run typecheck`.
- If the change affects bundling or route wiring, also run `npm run build`.
- `npm run test` runs Vitest. The repo has focused worker tests already; add more when behavior becomes non-trivial instead of assuming broad coverage exists.
- For formatting-only verification, use `npx prettier --check <paths>` or `npm run format:check`.

## Local Setup And Useful Commands

```bash
npm install
cp .dev.vars.example .dev.vars
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed-initial-user -- --email you@example.com --name "Your Name"
```

Notes:

- `.dev.vars.example` currently defines `LOG_LEVEL`, `JWT_SECRET`, `TURNSTILE_SITE_KEY`, and `TURNSTILE_SECRET`.
- `npm run db:migrate` is currently wired to `wrangler d1 migrations apply bland-prod --local`.
- `scripts/seed-initial-user.ts` seeds the initial local user, workspace, and owner membership. It refuses to run if users already exist.

## Change Guidelines

### Frontend changes

- Add or adjust routes in [src/client/route-tree.tsx](/home/vendetta/code/bland/src/client/route-tree.tsx).
- Keep network calls centralized in [src/client/lib/api.ts](/home/vendetta/code/bland/src/client/lib/api.ts).
- Keep shared app chrome in [src/client/components/app-shell.tsx](/home/vendetta/code/bland/src/client/components/app-shell.tsx), [src/client/components/header.tsx](/home/vendetta/code/bland/src/client/components/header.tsx), and [src/client/components/footer.tsx](/home/vendetta/code/bland/src/client/components/footer.tsx).
- Preserve the existing Zustand store split unless there is a concrete reason to change it.
- [src/client/components/editor/editor-body.tsx](/home/vendetta/code/bland/src/client/components/editor/editor-body.tsx) wires the shared Tiptap editor instance and mounts the floating controllers. Update it instead of creating one-off editor shells in page views.
- [src/client/components/editor/extensions/create-editor-extensions.ts](/home/vendetta/code/bland/src/client/components/editor/extensions/create-editor-extensions.ts) owns the shared Tiptap extension list. Extend it instead of duplicating editor configuration in callers.
- [src/client/components/editor/styles/content.css](/home/vendetta/code/bland/src/client/components/editor/styles/content.css), [src/client/components/editor/styles/overlays.css](/home/vendetta/code/bland/src/client/components/editor/styles/overlays.css), and [src/client/styles/emoji-picker.css](/home/vendetta/code/bland/src/client/styles/emoji-picker.css) own shared editor and emoji-picker styling overrides. Keep styling changes centralized there.
- When adding editor behavior, prefer composing existing Tiptap/ProseMirror extensions and controllers over introducing another editor framework or parallel abstraction.

### Worker changes

- Register HTTP behavior through the owning module in `src/worker/routes/` and keep top-level setup in [src/worker/router.ts](/home/vendetta/code/bland/src/worker/router.ts).
- Keep request validation at the boundary with `zod` or shared schemas.
- Put reusable worker logic in helpers or middleware instead of overloading route handlers.
- Keep 4xx failures explicit and user-actionable where possible. Reserve 500s for genuinely unexpected errors.

### Auth and security changes

- Treat auth, invite acceptance, JWT issuance, refresh cookies, Turnstile verification, uploads, and future share links as security-sensitive.
- Preserve fail-closed behavior when secrets, tokens, or verification results are missing or invalid.
- Do not log secrets, bearer tokens, refresh cookies, or password material.
- Do not weaken cookie flags, rate limits, or origin assumptions casually.

## Deferred Work

Known gaps that are intentionally deferred to later milestones. Do not fix these unless the task explicitly calls for it.

- **ON DELETE CASCADE for page_shares**: The schema lacks cascade constraints on `page_shares.page_id`. App code handles deletion order correctly, but the DB-level safety net is missing.
- **Presigned R2 URLs**: Upload data flows through the Worker (`PUT /uploads/:id/data`) rather than direct-to-R2 via presigned URLs. The R2 binding has no presigned URL API; true presigning requires S3-compatible credentials. Acceptable at ≤50 users with 10MB max. Revisit if upload volume justifies the S3 credential setup.
- **Orphaned upload garbage collection**: There is no delete uploads API. R2 objects are never removed — replacing or deleting an image from a document leaves the old blob in R2. Needs a periodic GC job that scans `doc_snapshots` for referenced upload URLs and deletes R2 objects not referenced by any document.

## Coupled Components

The authenticated view (`page-view.tsx`, `sidebar/sidebar.tsx`) and the share-link view (`shared-page-view.tsx`, `shared-page-tree.tsx`) render structurally identical UI in several places. The following shared primitives in `src/client/components/ui/` prevent style and behavior drift:

- **`mobile-drawer.tsx`** — responsive desktop-inline / mobile-overlay pattern used by `sidebar.tsx` and `shared-page-view.tsx`
- **`page-cover.tsx`** — cover image or gradient render, with optional `shareToken` for upload URL auth; used by `page-view.tsx` and `shared-page-view.tsx`
- **`page-error-state.tsx`** — centered AlertCircle + message; used by `page-view.tsx` and `shared-page-view.tsx`
- **`page-loading-skeleton.tsx`** — breadcrumb + title + body skeleton placeholder; used by `page-view.tsx` and `shared-page-view.tsx`

Intentionally divergent pieces that remain in each caller:

- `page-view.tsx` wraps `PageCover` in a `group/cover relative` div for the `CoverPicker` hover overlay. `shared-page-view.tsx` uses a plain wrapper.
- `page-view.tsx` conditionally renders a cover skeleton (via `knownHasCover`). `shared-page-view.tsx` does not.
- Error messages and outer container sizing differ by context — passed as props.
- `error-boundary.tsx` and `route-tree.tsx` have similar error patterns but include a reload button; these are intentionally separate.

When modifying cover rendering, error states, loading skeletons, or mobile drawer behavior, update the shared component rather than the individual callers.

## First Files To Read

- [bland-production-spec.md](/home/vendetta/code/bland/bland-production-spec.md)
- [package.json](/home/vendetta/code/bland/package.json)
- [wrangler.jsonc](/home/vendetta/code/bland/wrangler.jsonc)
- [src/client/components/editor/editor-pane.tsx](/home/vendetta/code/bland/src/client/components/editor/editor-pane.tsx)
- [src/client/components/editor/editor-body.tsx](/home/vendetta/code/bland/src/client/components/editor/editor-body.tsx)
- [src/client/components/editor/extensions/create-editor-extensions.ts](/home/vendetta/code/bland/src/client/components/editor/extensions/create-editor-extensions.ts)
- [src/client/route-tree.tsx](/home/vendetta/code/bland/src/client/route-tree.tsx)
- [src/client/lib/api.ts](/home/vendetta/code/bland/src/client/lib/api.ts)
- [src/client/components/editor/styles/content.css](/home/vendetta/code/bland/src/client/components/editor/styles/content.css)
- [src/client/components/editor/styles/overlays.css](/home/vendetta/code/bland/src/client/components/editor/styles/overlays.css)
- [src/client/styles/emoji-picker.css](/home/vendetta/code/bland/src/client/styles/emoji-picker.css)
- [src/shared/doc-messages.ts](/home/vendetta/code/bland/src/shared/doc-messages.ts)
- [src/shared/types.ts](/home/vendetta/code/bland/src/shared/types.ts)
- [src/worker/router.ts](/home/vendetta/code/bland/src/worker/router.ts)
- [src/worker/db/schema.ts](/home/vendetta/code/bland/src/worker/db/schema.ts)
- [src/worker/durable-objects/doc-sync.ts](/home/vendetta/code/bland/src/worker/durable-objects/doc-sync.ts)
- [src/worker/routes/auth.ts](/home/vendetta/code/bland/src/worker/routes/auth.ts)
- [src/worker/routes/workspaces.ts](/home/vendetta/code/bland/src/worker/routes/workspaces.ts)
- [src/worker/routes/pages.ts](/home/vendetta/code/bland/src/worker/routes/pages.ts)
- [src/worker/routes/shares.ts](/home/vendetta/code/bland/src/worker/routes/shares.ts)
- [src/worker/routes/uploads.ts](/home/vendetta/code/bland/src/worker/routes/uploads.ts)
- [src/worker/routes/search.ts](/home/vendetta/code/bland/src/worker/routes/search.ts)
- [src/worker/queues/search-indexer.ts](/home/vendetta/code/bland/src/worker/queues/search-indexer.ts)

## References

This file intentionally follows the style used in your other repos under `~/code`, especially:

- purpose and live-source-tree emphasis from `flamemail`
- minimal-code philosophy and greenfield caution from `anvil`
- architecture and invariant sections from `git-on-cloudflare`

Keep this file updated when the scaffold turns into a fuller v1 implementation.
