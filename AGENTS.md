# AGENTS.md

## Rules To Remember

"Can we do more with less code?"

"Do the hard things now, or be forced to do harder things in the future."

These rules are ordered, not contradictory.

Start with the smallest correct implementation that preserves correctness, performance, security, and clarity.

Prefer the smallest diff when the problem is truly local.

If the smallest diff creates known fragility, blurred ownership, or an architectural dead end, pay the structural cost now instead of layering another shortcut on top.

Keep ownership explicit: let routes compose layout and synchronous guards, let providers or components own async resolution and state machines, let stores hold durable snapshots and cache, and keep view components focused on rendering and page-local actions.

If a larger abstraction is merely optional, present it as an option instead of making it the default.

## Naming

- The product name is `bland`, always lowercase.
- Do not describe `bland` as "Notion" or "a Notion clone" in code, comments, docs, or user-facing copy.

## Source Of Truth

- `bland` is live in production. The live source tree and runtime bindings are authoritative.
- Start with the live code, `wrangler.jsonc`, shared contracts, and active schemas.
- `docs/frontend-spec.md` is the active frontend reference design to keep consistent across `devbin.tools` products.
- `.impeccable.md` is the design context for visual and UX decisions.
- `docs/bland-production-spec.md` is historical context only. Do not treat it as source of truth or update target for normal feature work.
- The live editor is the custom Tiptap/ProseMirror implementation under `src/client/components/editor/`. Older BlockNote references in docs are stale unless explicitly called out as historical or planned.

## Working Rules

- Keep edits scoped and minimal.
- Do not trade a small diff for a fragile design when the structural fix is already clear.
- When reviewing a diff, start by checking whether the problem is truly local or a symptom of a broader ownership, state, or data-flow issue.
- Keep bug reports, repros, and regressions grounded in actions a human can actually perform in a browser. If triggering a state requires an impossible synthetic transition, such as jumping directly from `/ws-a/p-a` to `/ws-b/p-b` in a way the browser UI cannot produce, it is not a product bug.
- Prefer the smallest correct patch, but do not force a localized fix when the durable solution is holistic. Call out when the real fix needs to cross the current diff boundary.
- Avoid review feedback that only shuffles the bug or defers the same issue to a follow-up diff. Review churn from an underscoped fix is worse than a slightly larger correct patch.
- Prefer explicit code over clever code. Small duplication is fine when it keeps ownership obvious.
- Reuse existing helpers, stores, contracts, route patterns, and UI primitives before adding new ones.
- Reuse security-sensitive worker helpers before inlining logic: `src/worker/lib/auth.ts` (`getJwtSecret`, `verifyAccessToken`, `setRefreshCookie`, `clearRefreshCookie`, `generateSecureToken`), `src/worker/lib/origins.ts` (`getAllowedOrigins`, `isAllowedOrigin`), `src/worker/lib/membership.ts` (`requireMembership`), and `src/worker/lib/permissions.ts` (`resolvePrincipal`, `resolvePageAccessLevels`, `canAccessPage`, `canAccessPages`, `toResolvedViewerContext`).
- Preserve the split between `src/client`, `src/worker`, and `src/shared`.
- If request or response shapes change, update both the worker boundary and `src/shared/types.ts`.
- If DocSync custom message shapes change, update `src/shared/doc-messages.ts`.
- Multiple agents may be working in parallel. Do not revert unrelated changes.
- Assume the dev server may already be running. Do not start `npm run dev` unless the task clearly requires it.

## Architecture And Invariants

- Core architecture is stable: React SPA + Cloudflare Worker API + D1 + Durable Objects for doc sync and search indexing + R2 for uploads + Queues for derived search indexing.
- D1 is authoritative for users, workspaces, memberships, page tree metadata including `pages.title`, invites, shares, and upload metadata.
- DocSync Durable Object local SQLite is authoritative for persisted Yjs document content.
- WorkspaceIndexer Durable Object local SQLite is authoritative for the derived FTS index.
- R2 stores blobs only. Access control must remain D1-backed.
- Live collaborative document state belongs in the per-document Durable Object. Presence and cursor state are ephemeral and should not be persisted.
- Search is a derived projection. Treat queue-driven indexing as rebuildable.
- The Worker orchestrates cross-runtime calls. Keep boundaries to a single hop from the Worker and do not add DO -> DO calls.
- Durable Object RPCs should return tagged unions for expected outcomes and reserve `throw` for truly unrecoverable errors.
- Use `blockConcurrencyWhile` only in Durable Object constructors for setup and migration, never in RPC methods.
- Do not rely on `this.ctx.id.name` inside Durable Objects.
- Cold uncached editor hydration should bootstrap body content from the Worker-owned page snapshot route before mounting the editor on a live DocSync session. Do not mount a writable editor against an empty local `Y.Doc` and wait for live sync to fill it.
- Preserve D1 bookmark propagation in `src/worker/router.ts` and `src/client/lib/api.ts`.
- Mutating requests should continue to prefer primary D1 reads.
- Refresh tokens live in the `bland_refresh` cookie. Access tokens stay in client state.
- Auth, invites, refresh cookies, Turnstile, uploads, and share links are security-sensitive. Keep them fail-closed and do not weaken cookie flags, origin checks, or rate limits.
- The local Turnstile bypass in `src/worker/middleware/turnstile.ts` is intentional and must not be extended beyond local environments.
- Do not log secrets, bearer tokens, refresh cookies, or password material.

## Change Guidance

### Frontend

- Express app chrome through explicit layout routes rooted at `src/client/route-tree.tsx` and `src/client/components/root-shell.tsx`, not route metadata switches.
- Keep asynchronous route and page loading in providers or components, not route `beforeLoad`. Use `beforeLoad` only for synchronous auth and redirect guards.
- Keep workspace route resolution in `src/client/components/workspace/view-provider.tsx`, canonical page-context derivation in `src/client/components/workspace/use-canonical-page-context.ts`, the shared active-page state machine in `src/client/components/active-page/provider.tsx` with canonical glue in `src/client/components/active-page/canonical.tsx`, canonical mention wiring in `src/client/components/page-mention/canonical-surface.tsx`, and share-link state in `src/client/components/share/view-provider.tsx`. Keep `workspace/page-view.tsx` and `share/page-view.tsx` focused on rendering and page-local actions.
- Keep stable allow/deny permission semantics in `src/shared/entitlements/`. Keep client UX action visibility and disabled state in `src/client/lib/affordance/`. Do not collapse these back into one monolithic client permission bag.
- Keep `src/client/stores/workspace-store.ts` as a persisted cache and snapshot store, not a home for transient request lifecycle or active-route state.
- Prefer discriminated unions like `WorkspaceRouteState` and `ActivePageState`, plus pure helpers under `src/client/lib/`, for non-trivial routing and loading logic.
- Use `createRequestGuard` for async effects that can overlap during navigation or provider remounts, and `classifyFailure` plus structured worker error codes for failure handling. Do not branch on error-message text.
- Prefer derived state, event handlers, reducers, or pure helpers over adding another `useEffect`. Do not use effects as a default escape hatch for ordinary React data flow.
- Treat `useEffect` dependency arrays as correctness-critical. Do not introduce circular update paths where an effect depends on state that the effect itself mutates unless the guard is explicit, necessary, and obviously safe on a second read.
- Keep network calls centralized in `src/client/lib/api.ts`.
- Extend the shared editor under `src/client/components/editor/` instead of creating parallel editor shells or abstractions.
- Treat editor features as cross-cutting work, not isolated node or command changes. If a change adds new document structure or editing UI, verify the surrounding extension registry, controller surfaces, slash or insert entry points, affordance or runtime plumbing, and selection semantics such as `context-aware-select-all` still compose correctly.
- Keep `src/client/components/editor/editor-runtime-context.ts` operational only, and keep UI editing affordances in `src/client/components/editor/editor-affordance-context.ts`. Do not infer mention/upload affordances from raw runtime fields when the affordance layer already owns them.
- Keep the authenticated workspace surface and the share surface aligned through shared primitives such as `src/client/components/ui/mobile-drawer.tsx`, `page-cover.tsx`, `page-error-state.tsx`, and `page-loading-skeleton.tsx`, rather than parallel rewrites.
- When changing collaboration or route-loading behavior, verify both member and share flows and update focused regression coverage, including `tests/e2e/specs/08-rapid-page-navigation.spec.ts`, `tests/e2e/specs/10-shared-rapid-navigation.spec.ts`, and `tests/e2e/specs/12-canonical-page-cold-deep-link.spec.ts` when applicable.

### Worker

- Register HTTP behavior in the owning module under `src/worker/routes/` and keep top-level wiring in `src/worker/router.ts`.
- Keep page-access resolution and viewer-surface context in `src/worker/lib/permissions.ts`. Reuse `resolvePrincipal`, `resolvePageAccessLevels`, and `toResolvedViewerContext` from routes and WebSocket auth instead of re-encoding page-share walks or member-vs-share branching inline.
- Validate requests at the boundary with `zod` or shared schemas.
- Put reusable worker logic in helpers or middleware instead of bloating route handlers.
- Keep 4xx failures explicit and actionable. Reserve 500s for genuinely unexpected errors.

### Database And Generated Files

- `src/worker/db/d1/schema.ts`, `src/worker/db/docsync-do/schema.ts`, and `src/worker/db/workspace-indexer/schema.ts` are the schema sources of truth.
- Edit schema sources first.
- Do not hand-edit generated files under `drizzle/` unless the task explicitly calls for a hand-written migration.

## Validation

- For most code changes, run `npm run typecheck`.
- Also run `npm run build` when route wiring, bundling, or runtime registration changes.
- Add or update focused Vitest or Playwright coverage when behavior becomes non-trivial.
- Run E2E with `npm run test:e2e`. The Playwright harness in `tests/e2e/` applies local D1 migrations, seeds the test user, and starts its own isolated dev server.
- Run a focused E2E spec with `npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/specs/<spec>.spec.ts`.
- Do not start `npm run dev` just to run E2E unless the task explicitly requires manual debugging outside the harness.
- Use `BLAND_E2E_PRESERVE=1 npm run test:e2e` when debugging failures. The harness will keep the temp state, print the preserved paths, and print the command to reopen that state in a local dev server.
- If Playwright browser binaries are missing locally, install them with `npx playwright install chromium`.
- Use `npx prettier --check <paths>` or `npm run format:check` for formatting verification.

## Deferred Work

Known gaps that are intentionally deferred to later milestones. Do not fix these unless the task explicitly calls for it.

- **ON DELETE CASCADE for page_shares**: The schema lacks cascade constraints on `page_shares.page_id`. App code handles deletion order correctly, but the DB-level safety net is missing.
- **Presigned R2 URLs**: Upload data flows through the Worker (`PUT /uploads/:id/data`) rather than direct-to-R2 via presigned URLs. The R2 binding has no presigned URL API; true presigning requires S3-compatible credentials. Acceptable at ≤50 users with 10MB max. Revisit if upload volume justifies the S3 credential setup.
- **Orphaned upload garbage collection**: There is no delete uploads API. R2 objects are never removed — replacing or deleting an image from a document leaves the old blob in R2. Needs a periodic GC job that scans DocSync DOs for referenced upload URLs and deletes R2 objects not referenced by any document.
- **DocSync DO storage cleanup on workspace delete**: Workspace deletion calls `WorkspaceIndexer.clear()` but does not explicitly clean DocSync DO storage for each page. DO auto-eviction handles this eventually.
- **Shared seeded E2E workspace coupling**: The default Playwright harness seeds a single reusable `bland` workspace for the whole run. Specs that assume a short or empty page tree, especially sidebar drag scenarios, should prefer creating isolated workspaces rather than relying on that shared seed state.
- **AI output structure is text-parsed, not schema-bound**: First-wave AI rewrite/generate prompt the model for plain text with `\n\n` paragraph breaks and `-`/`*` bullet lines, then convert on the client via `parseAiBlocksFromText` in `src/client/lib/ai/blocks.ts`. Only paragraphs and bullet lists are recognized — headings, nested lists, inline marks (bold/italic/links), code blocks, and tables all flatten to paragraph text. The alternatives are a real markdown parser (`marked`/`markdown-it`) feeding Tiptap content JSON, or model-side structured output via function calling. Streaming UX and model portability across Workers AI models are the current reasons against structured output, not correctness. Revisit when ask-workspace answers, citations, or richer rewrite outputs need fidelity beyond paragraphs and bullets.

## Entrypoints

- `package.json`
- `wrangler.jsonc`
- `src/shared/entitlements/`
- `src/shared/types.ts`
- `src/shared/doc-messages.ts`
- `src/client/route-tree.tsx`
- `src/client/components/root-shell.tsx`
- `src/client/components/workspace/`
- `src/client/components/active-page/`
- `src/client/components/page-mention/`
- `src/client/components/share/`
- `src/client/components/editor/`
- `src/client/lib/affordance/`
- `src/client/stores/workspace-store.ts`
- `src/client/lib/api.ts`
- `src/client/lib/*-model.ts`
- `src/worker/index.ts`
- `src/worker/router.ts`
- `src/worker/routes/`
- `src/worker/lib/permissions.ts`
- `src/worker/db/*/schema.ts`
- `src/worker/durable-objects/`
- `src/worker/queues/search-indexer.ts`
