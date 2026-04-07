# AGENTS.md

## One Rule To Remember

"Can we do more with less code?"

`bland-production-spec.md` is explicit about this and the repo should follow it. Prefer the smallest correct implementation that preserves correctness, performance, and security. If a larger abstraction or refactor is optional, present it as an option instead of making it the default.

## Naming

- The product name is `bland`, always lowercase.
- Do not describe `bland` as "Notion" or "a Notion clone" in code, comments, docs, or user-facing copy.

## Repository Status

- This repository is greenfield and still close to its initial scaffold.
- The production spec is ambitious and intentionally ahead of the current implementation in several areas.
- Write changes against the live source tree, not the spec alone.
- Expect core architecture to remain stable:
  React SPA + Cloudflare Worker API + D1 as primary structured store + Durable Objects for doc sync + R2 for uploads + Queues for derived search indexing.
- Expect many v1 features to be partially implemented or stubbed today.
  `DocSync` is implemented in [src/worker/durable-objects/doc-sync.ts](/home/vendetta/code/bland/src/worker/durable-objects/doc-sync.ts) as a `YServer` subclass with snapshot persistence (`onLoad`/`onSave`).
  Queue consumption is implemented for FTS5 search indexing (`src/worker/queues/search-indexer.ts`).
  The schema already includes tables for snapshots, shares, and uploads even where full behavior is not wired yet.

## Source Of Truth

- The current source tree wins when it conflicts with docs.
- `bland-production-spec.md` is the product and architecture reference.
- `frontend-spec.md` is the frontend reference design to keep consistent across `devbin.tools` products.
- `src/shared/types.ts` is the shared client/worker contract surface for public API shapes.
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

### Client constants (`src/client/lib/constants.ts`)

- `TURNSTILE_SITE_KEY` — from env or test fallback.
- `STORAGE_KEYS` — `{ D1_BOOKMARK, USER, LAYOUT, SIDEBAR }` for localStorage keys.

### Client helpers (`src/client/lib/api.ts`, `src/client/lib/permissions.ts`)

- `toApiError(err)` — safely cast an unknown catch error to `ApiError`. Use instead of `err as ApiError`.
- `canArchivePage(members, currentUser, page)` — returns whether the user can archive a page.

## High-Level Architecture

### Frontend

- `src/client/main.tsx` boots the React 19 SPA and TanStack Router.
- `src/client/route-tree.tsx` is the route graph and current route-loading behavior.
- `src/client/components/` owns the app shell, auth pages, workspace layout, sidebar, and page views.
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

- **Toast notification system** (`frontend-spec.md` §8): Not built yet. Until it exists, silent `catch` blocks in UI components (sidebar, workspace views) are acceptable. Target: M5.
- **`components/ui/` primitives** (`frontend-spec.md` §2, §8): A shared `Skeleton` exists, but Button, Input, Card, and Dialog primitives are not extracted yet — most styles are still inlined in each component. Extract the broader primitive set when M5 (Polish) work begins.
- **Real-time icon/cover sync**: Icon and cover live in D1 only (REST PATCH). Other connected users don't see changes until their next page load. Broadcast via DocSync custom messages (`sendMessage`/`onCustomMessage`) to push updates live. Target: M5.
- **Error boundaries**: No React error boundaries exist. Add around `EditorPane` and route-level content when M5 lands.
- **ON DELETE CASCADE for page_shares**: The schema lacks cascade constraints on `page_shares.page_id`. App code handles deletion order correctly, but the DB-level safety net is missing.
- **Presigned R2 URLs**: Upload data flows through the Worker (`PUT /uploads/:id/data`) rather than direct-to-R2 via presigned URLs. The R2 binding has no presigned URL API; true presigning requires S3-compatible credentials. Acceptable at ≤50 users with 10MB max. Revisit if upload volume justifies the S3 credential setup.

## First Files To Read

- [bland-production-spec.md](/home/vendetta/code/bland/bland-production-spec.md)
- [package.json](/home/vendetta/code/bland/package.json)
- [wrangler.jsonc](/home/vendetta/code/bland/wrangler.jsonc)
- [src/client/route-tree.tsx](/home/vendetta/code/bland/src/client/route-tree.tsx)
- [src/client/lib/api.ts](/home/vendetta/code/bland/src/client/lib/api.ts)
- [src/shared/types.ts](/home/vendetta/code/bland/src/shared/types.ts)
- [src/worker/router.ts](/home/vendetta/code/bland/src/worker/router.ts)
- [src/worker/db/schema.ts](/home/vendetta/code/bland/src/worker/db/schema.ts)
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
