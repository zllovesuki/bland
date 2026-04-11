# AGENTS.md

## Rules To Remember

"Can we do more with less code?"

"Do the hard things now, or be forced to do harder things in the future."

`docs/bland-production-spec.md` is explicit about the first rule and the repo should follow it. Prefer the smallest correct implementation that preserves correctness, performance, and security.

The second rule is the check against false simplicity. Do not choose a design just because it is smaller today if it is likely to become an architectural dead end, force predictable refactors, or make the next layer of features harder to add safely. Pay necessary structural costs early when the alternative is known fragility.

If a larger abstraction or refactor is optional, present it as an option instead of making it the default. If the current design is obviously too weak for the feature pressure already visible in the repo, fix the design instead of layering another shortcut on top.

## Naming

- The product name is `bland`, always lowercase.
- Do not describe `bland` as "Notion" or "a Notion clone" in code, comments, docs, or user-facing copy.

## Repository Status

- This repository is still greenfield, but it is no longer just the initial scaffold.
  Auth/workspace/page flows, share links, uploads, collaborative editing, and queue-driven search indexing all exist in the live tree today.
- The production spec is ambitious and intentionally ahead of the current implementation in several areas.
- Write changes against the live source tree, not the spec alone.
- Expect core architecture to remain stable:
  React SPA + Cloudflare Worker API + D1 as primary structured store + Durable Objects for doc sync and search indexing + R2 for uploads + Queues for derived search indexing.
- Expect many v1 features to be partially implemented or stubbed today.
  `DocSync` is implemented in [src/worker/durable-objects/doc-sync.ts](/home/vendetta/code/bland/src/worker/durable-objects/doc-sync.ts) as a `YServer` subclass with DO-local SQLite snapshot persistence (`onLoad`/`onSave`) and a `getIndexPayload` RPC for search indexing.
  `WorkspaceIndexer` is implemented in [src/worker/durable-objects/workspace-indexer.ts](/home/vendetta/code/bland/src/worker/durable-objects/workspace-indexer.ts) as a per-workspace Durable Object owning FTS5 search data.
  Queue consumption is implemented for search indexing (`src/worker/queues/search-indexer.ts`), orchestrating DocSync and WorkspaceIndexer RPCs.
- The live editor is a custom Tiptap/ProseMirror implementation under `src/client/components/editor/`. Treat older BlockNote references in docs as stale unless they are explicitly called out as historical or planned.

## Source Of Truth

- The current source tree wins when it conflicts with docs.
- `docs/bland-production-spec.md` is the product and architecture reference.
- `docs/frontend-spec.md` is the frontend reference design to keep consistent across `devbin.tools` products.
- `src/shared/types.ts` is the shared client/worker contract surface for public API shapes.
- `src/shared/doc-messages.ts` is the shared client/worker contract surface for DocSync custom messages. Update it when changing custom message payloads.
- `src/worker/db/d1/schema.ts` is the D1 schema source of truth. `src/worker/db/docsync-do/schema.ts` and `src/worker/db/workspace-indexer/schema.ts` own DO-local schemas. Do not hand-edit generated SQL in `drizzle/`.
- `wrangler.jsonc` is the runtime binding contract for D1, R2, Queues, Durable Objects, and rate limits.

## Working Rules

- Keep edits scoped and minimal.
- Do not trade a small diff for a fragile design. When a structural fix is clearly required to keep the next features from causing churn, do the structural fix.
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

- `src/worker/index.ts` is the Worker entrypoint, routes Partyserver WebSocket connections to `DocSync`, exports the `DocSync` and `WorkspaceIndexer` Durable Objects, and handles queue consumption.
- `src/worker/router.ts` wires Hono, CORS, D1 session handling, route registration, 404s, and top-level error handling.
- `src/worker/routes/` contains the current HTTP surface for auth, invites, workspaces, pages, page-tree, page-context, shares, uploads, search, and health.
- `src/worker/middleware/` owns auth, rate limiting, and Turnstile verification.
- `src/worker/db/d1/schema.ts` defines the Drizzle schema for D1 (app-global metadata).
- `src/worker/db/docsync-do/schema.ts` defines the DocSync DO-local SQLite schema (snapshot chunking).
- `src/worker/db/workspace-indexer/schema.ts` defines the WorkspaceIndexer DO-local SQLite schema (index state companion table; FTS5 is created manually).
- `src/worker/durable-objects/doc-sync.ts` owns per-page Yjs snapshot persistence and a `getIndexPayload` RPC.
- `src/worker/durable-objects/workspace-indexer.ts` owns per-workspace FTS5 search data with `indexPage`, `removePage`, `search`, and `clear` RPCs.

### Platform bindings

Configured in [wrangler.jsonc](/home/vendetta/code/bland/wrangler.jsonc):

- `DB`: D1 primary structured store
- `R2`: upload bucket
- `SEARCH_QUEUE`: queue producer/consumer for derived indexing work
- `DocSync`: Durable Object namespace for per-document sync (PascalCase name required by partyserver routing)
- `WorkspaceIndexer`: Durable Object namespace for per-workspace search indexing
- `RL_AUTH`, `RL_API`: Cloudflare rate limiting bindings

## Important Invariants

- D1 is the source of truth for users, workspaces, memberships, page tree metadata (including `pages.title`), invites, shares, and uploads.
- Document content (Yjs snapshots) is persisted in each DocSync DO's local SQLite, not in D1. DocSync syncs `pages.title` back to D1 in `onSave`.
- Full-text search data lives in each WorkspaceIndexer DO's local SQLite (FTS5). One WorkspaceIndexer per workspace.
- Live collaborative document state belongs in the per-document Durable Object. Do not move authoritative live document content into ad hoc worker globals or the client.
- Presence/cursor state is ephemeral. Do not persist it in D1 or R2.
- Search is a derived projection. Treat queue-driven indexing as rebuildable.
- Keep cross-runtime boundaries to a single hop from the Worker. Worker → D1, Worker → DocSync DO, Worker → WorkspaceIndexer DO are all allowed. Do NOT chain transitively (e.g. Worker → DO → D1 is not allowed except for DocSync's `onSave` title sync which is DO → D1, a known single hop).
- Do not add DO → DO calls. The Worker orchestrates across DOs.
- Durable Objects should not throw in RPC methods. Use tagged union return types (`{ kind: "found"; ... } | { kind: "missing" }`) to communicate outcomes. Reserve `throw` for truly unrecoverable errors.
- `blockConcurrencyWhile` should only be used in the DO constructor for migration, never in RPC methods.
- Do not use `this.ctx.id.name` inside Durable Objects — it is not guaranteed to be populated. DocSync uses `this.name` (from partyserver) in WebSocket paths only; RPC methods accept explicit IDs.
- R2 stores blobs, not authorization state. Access control must continue to come from D1-backed checks.
- D1 bookmark propagation is intentional. Preserve the `x-d1-bookmark` flow in [src/worker/router.ts](/home/vendetta/code/bland/src/worker/router.ts) and [src/client/lib/api.ts](/home/vendetta/code/bland/src/client/lib/api.ts) when changing request handling.
- Mutating requests should continue to prefer primary D1 reads. Do not accidentally regress read-after-write behavior.
- DocSync custom messages are a shared contract. Keep their JSON shapes centralized in [src/shared/doc-messages.ts](/home/vendetta/code/bland/src/shared/doc-messages.ts) instead of duplicating ad hoc payload parsing across client and worker code.
- Local Turnstile bypass is intentional in [src/worker/middleware/turnstile.ts](/home/vendetta/code/bland/src/worker/middleware/turnstile.ts). Do not extend that bypass to non-local environments. Localhost detection uses `isLocalRequestUrl` from `src/worker/http.ts` — use it instead of inline hostname checks.
- Refresh tokens live in the `bland_refresh` cookie and access tokens stay in client state. Keep auth changes aligned with that model unless the task explicitly changes it.

## Greenfield Guidance

- The schema and bindings were set up ahead of all feature work. A table or binding existing does not mean the full product flow exists yet.
- Favor incremental delivery over speculative framework-building.
- When implementing a feature from `docs/bland-production-spec.md`, land the minimal vertical slice that matches the current repo style.
- If the spec and scaffold diverge, either:
  1. implement the smallest missing piece required by the task, or
  2. document the gap briefly and keep the change constrained.

## Database And Generated Files

- Three separate drizzle configs and output dirs, following the anvil pattern:
  - `drizzle-d1.config.ts` → `drizzle/d1/` — D1 relational schema
  - `drizzle-docsync-do.config.ts` → `drizzle/docsync-do/` — DocSync DO-local SQLite (snapshot chunking)
  - `drizzle-workspace-indexer.config.ts` → `drizzle/workspace-indexer/` — WorkspaceIndexer DO-local SQLite
- Update the appropriate schema in `src/worker/db/{d1,docsync-do,workspace-indexer}/schema.ts` first.
- Then run `npm run db:generate` (runs all three) or `npm run db:generate:d1` / `db:generate:docsync-do` / `db:generate:workspace-indexer` individually.
- Do not manually edit `drizzle/**/*.sql` unless the user explicitly asks for a hand-written migration.
- DO configs use `driver: "durable-sqlite"` and generate a `migrations.js` file used by the DO constructor's `blockConcurrencyWhile` → `migrate()` pattern.
- D1 migrations are applied via `npm run db:migrate` (`wrangler d1 migrations apply`).
- FTS5 in WorkspaceIndexer is created via raw SQL in the constructor after drizzle migration (drizzle cannot manage FTS5 virtual tables).

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
- Editor styles are split under `src/client/components/editor/styles/`. Keep shared editor-surface rules in [src/client/components/editor/styles/content.css](/home/vendetta/code/bland/src/client/components/editor/styles/content.css) and [src/client/components/editor/styles/table.css](/home/vendetta/code/bland/src/client/components/editor/styles/table.css), keep owner-specific editor styles in their focused files there, and keep emoji-picker overrides in [src/client/styles/emoji-picker.css](/home/vendetta/code/bland/src/client/styles/emoji-picker.css).
- When moving or splitting CSS, verify the extracted build CSS ordering and selector specificity. Do not assume local import order will survive Vite/Tailwind bundling; if two rules target the same element, prefer explicit selectors that win without relying on load order, or keep the dependent override in the same stylesheet.
- When adding editor behavior, prefer composing existing Tiptap/ProseMirror extensions and controllers over introducing another editor framework or parallel abstraction.
- When debugging hover, focus, or pointer bugs in frontend UI, verify first whether the interactive state is actually being lost or only rendered invisibly. Use DevTools to inspect `:hover`/computed styles before changing JavaScript; a visual bug can still be a CSS contrast or layering issue even when it feels event-related.

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
- **Orphaned upload garbage collection**: There is no delete uploads API. R2 objects are never removed — replacing or deleting an image from a document leaves the old blob in R2. Needs a periodic GC job that scans DocSync DOs for referenced upload URLs and deletes R2 objects not referenced by any document.
- **DocSync DO storage cleanup on workspace delete**: Workspace deletion calls `WorkspaceIndexer.clear()` but does not explicitly clean DocSync DO storage for each page. DO auto-eviction handles this eventually.
- **DocSync `getSnapshot` RPC**: Only `getIndexPayload` (text extraction) is implemented. A generic `getSnapshot` returning the raw Yjs blob is deferred until a real caller needs it (e.g. export, non-WebSocket page loads).

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

- [docs/bland-production-spec.md](/home/vendetta/code/bland/docs/bland-production-spec.md)
- [package.json](/home/vendetta/code/bland/package.json)
- [wrangler.jsonc](/home/vendetta/code/bland/wrangler.jsonc)
- [src/client/components/editor/editor-pane.tsx](/home/vendetta/code/bland/src/client/components/editor/editor-pane.tsx)
- [src/client/components/editor/editor-body.tsx](/home/vendetta/code/bland/src/client/components/editor/editor-body.tsx)
- [src/client/components/editor/extensions/create-editor-extensions.ts](/home/vendetta/code/bland/src/client/components/editor/extensions/create-editor-extensions.ts)
- [src/client/route-tree.tsx](/home/vendetta/code/bland/src/client/route-tree.tsx)
- [src/client/lib/api.ts](/home/vendetta/code/bland/src/client/lib/api.ts)
- [src/client/components/editor/styles/content.css](/home/vendetta/code/bland/src/client/components/editor/styles/content.css)
- [src/client/components/editor/styles/table.css](/home/vendetta/code/bland/src/client/components/editor/styles/table.css)
- [src/client/styles/emoji-picker.css](/home/vendetta/code/bland/src/client/styles/emoji-picker.css)
- [src/shared/doc-messages.ts](/home/vendetta/code/bland/src/shared/doc-messages.ts)
- [src/shared/types.ts](/home/vendetta/code/bland/src/shared/types.ts)
- [src/worker/router.ts](/home/vendetta/code/bland/src/worker/router.ts)
- [src/worker/db/d1/schema.ts](/home/vendetta/code/bland/src/worker/db/d1/schema.ts)
- [src/worker/db/docsync-do/schema.ts](/home/vendetta/code/bland/src/worker/db/docsync-do/schema.ts)
- [src/worker/db/workspace-indexer/schema.ts](/home/vendetta/code/bland/src/worker/db/workspace-indexer/schema.ts)
- [src/worker/durable-objects/doc-sync.ts](/home/vendetta/code/bland/src/worker/durable-objects/doc-sync.ts)
- [src/worker/durable-objects/workspace-indexer.ts](/home/vendetta/code/bland/src/worker/durable-objects/workspace-indexer.ts)
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
