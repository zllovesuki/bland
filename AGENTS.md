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

- `bland` is live in production. The live source tree, runtime bindings, `wrangler.jsonc`, shared contracts, and active schemas are authoritative.
- Start with the live code. Historical docs are secondary unless the task explicitly asks for them.
- `docs/frontend-spec.md` is the active frontend reference for shared `devbin.tools` patterns. Open it only when the task touches client UI, UX consistency, or shared product chrome.
- `.impeccable.md` is the design context for visual tone, typography, and user-facing copy. Open it only for UI, UX, or copy work.
- `docs/bland-production-spec.md` is historical context only. Do not treat it as source of truth or a normal update target.
- The live editor is the custom Tiptap/ProseMirror implementation under `src/client/components/editor/`. Older BlockNote references are stale unless explicitly called out as historical or planned.

## Investigation Before Mutation

- Read before you edit. For non-local changes, read the target file plus at least one caller, consumer, sibling module, or test before changing code.
- Do not speculate when the live code, logs, types, or runtime can answer the question quickly.
- Do not propose or apply a fix until you have identified the actual failing path, or clearly marked the remaining uncertainty as an assumption.
- Match the user's real runtime and execution surface before trusting a result. Do not validate in a different shell, environment, or working directory and present it as equivalent.
- Re-open the relevant files when uncertain. Do not rely on stale earlier context, long-session memory, or "it probably works like X" reasoning.
- If a missing fact would materially change the implementation and cannot be derived locally, ask one focused question instead of patching around uncertainty.

## Context Hygiene

- Keep always-loaded instructions here short and high value. Put task-specific detail in the relevant file or doc and open it only when needed.
- Prefer narrow path-based reads over broad repo sweeps.
- Summarize what matters, then read the source again when resuming complex work instead of carrying long narrative state forward.
- Do not treat prior turns, saved memory, or inferred intent as higher-confidence than the current repo state.
- If the task is simple, keep the working set small. More context is not automatically better context.

## Working Rules

- Keep edits scoped and minimal.
- Unless the user explicitly asks for a modification, treat the repository, working tree, index, and staged/unstaged changes as read-only. Exploration, review, and diagnosis must not create, stage, unstage, revert, discard, or stash changes.
- Do not run destructive git or index-mutating commands such as `git add`, `git reset`, `git restore`, `git checkout`, `git stash`, `git commit`, or similar unless the user explicitly asks for that operation.
- Checking beats hypothesizing. Looking productive is not the goal; read, verify, then act.
- Do not declare root cause, safety, or completion from inference alone. Read back the changed surface and run the relevant check, or state plainly why a check was not run.
- Do not trade a small diff for a fragile design when the structural fix is already clear.
- When reviewing a diff, first check whether the problem is truly local or a symptom of broader ownership, state, or data-flow issues.
- Keep bug reports, repros, and regressions grounded in actions a human can actually perform in a browser. If the only trigger path is an impossible synthetic transition, it is not a product bug.
- Prefer the smallest correct patch, but do not force a localized fix when the durable solution is holistic. Call out when the real fix crosses the current diff boundary.
- Avoid review feedback that only shuffles the bug or defers the same issue to a follow-up diff. Review churn from an underscoped fix is worse than a slightly larger correct patch.
- Prefer explicit code over clever code. Small duplication is fine when it keeps ownership obvious.
- Reuse existing helpers, stores, contracts, route patterns, and UI primitives before adding new ones.
- Reuse security-sensitive worker helpers in `src/worker/lib/{auth,origins,membership,permissions}.ts` rather than re-encoding auth, origin, membership, or access logic inline.
- Reuse AI helpers in `src/worker/lib/ai/*`, `src/shared/ai.ts`, and `src/shared/entitlements/page-ai.ts`. New AI routes go through `createAiClient`, `RL_AI`, and `getPageAiEntitlements`; do not call the `AI` binding directly.
- Preserve the split between `src/client`, `src/worker`, and `src/shared`.
- If request or response shapes change, update both the worker boundary and `src/shared/types.ts`.
- If DocSync custom message shapes change, update `src/shared/doc-messages.ts`.
- Multiple agents may be working in parallel. Do not revert unrelated changes.
- Assume the dev server may already be running. Do not start `npm run dev` unless the task clearly requires it.

## Architecture And Invariants

- Core architecture is stable: React SPA + Cloudflare Worker API + D1 + Durable Objects for doc sync and search indexing + R2 for uploads + Queues for derived search indexing.
- D1 is authoritative for users, workspaces, memberships, page tree metadata including `pages.title`, invites, shares, and upload metadata.
- DocSync Durable Object local SQLite is authoritative for persisted Yjs document content. Live collaborative document state belongs in the per-document Durable Object; presence and cursor state are ephemeral and must not be persisted.
- WorkspaceIndexer Durable Object local SQLite is authoritative for the derived FTS index. Search is a rebuildable projection.
- R2 stores blobs only. Access control must remain D1-backed.
- The Worker orchestrates cross-runtime calls. Keep boundaries to a single hop from the Worker and do not add DO -> DO calls.
- Durable Object RPCs should return tagged unions for expected outcomes and reserve `throw` for truly unrecoverable failures. Use `blockConcurrencyWhile` only in constructors for setup or migration, never in RPC methods. Do not rely on `this.ctx.id.name`.
- Cold uncached editor hydration must bootstrap body content from the Worker-owned page snapshot route before mounting a writable editor against live DocSync.
- Preserve D1 bookmark propagation in `src/worker/router.ts` and `src/client/lib/api.ts`. Mutating requests should continue to prefer primary D1 reads.
- Refresh tokens live in the `bland_refresh` cookie. Access tokens stay in client state.
- Auth, invites, refresh cookies, Turnstile, uploads, and share links are security-sensitive. Keep them fail-closed and do not weaken cookie flags, origin checks, or rate limits. The local Turnstile bypass in `src/worker/middleware/turnstile.ts` is intentional and must not be extended beyond local environments. Do not log secrets, bearer tokens, refresh cookies, or password material.
- AI features (`rewrite`, `generate`, `summarize`, `ask-page`) are member-only. The shared surface entitlements in `src/shared/entitlements/page-ai.ts` deny every AI capability by default; do not loosen this without an intentional access-model design. AI suggestions stay transient on the client and must not be persisted as Yjs marks or server-side artifacts.

## Change Guidance

### Frontend

- Express app chrome through explicit layout routes rooted at `src/client/route-tree.tsx` and `src/client/components/root-shell.tsx`, not route metadata switches.
- Keep asynchronous route and page loading in providers or components, not route `beforeLoad`. Use `beforeLoad` only for synchronous auth and redirect guards.
- Keep workspace route resolution in `src/client/components/workspace/view-provider.tsx`, canonical page-context derivation in `src/client/components/workspace/use-canonical-page-context.ts`, and the shared active-page state machine in `src/client/components/active-page/provider.tsx` plus `src/client/components/active-page/canonical.tsx`.
- Keep canonical mention wiring in `src/client/components/page-mention/canonical-surface.tsx` and share-link state in `src/client/components/share/view-provider.tsx`. Keep `workspace/page-view.tsx` and `share/page-view.tsx` focused on rendering and page-local actions.
- Keep stable allow/deny permission semantics in `src/shared/entitlements/` and client action visibility/disabled state in `src/client/lib/affordance/`. Do not collapse them into one monolithic client permission bag.
- Keep `src/client/stores/workspace-store.ts` as a persisted cache and snapshot store, not a home for transient request lifecycle or active-route state.
- Prefer discriminated unions, derived state, reducers, event handlers, and pure helpers under `src/client/lib/` over adding another `useEffect`.
- Use `createRequestGuard` for async effects that can overlap during navigation or provider remounts, and `classifyFailure` plus structured worker error codes for failure handling. Do not branch on error-message text.
- Treat `useEffect` dependency arrays as correctness-critical.
- Keep network calls centralized in `src/client/lib/api.ts`.
- Extend the shared editor under `src/client/components/editor/` instead of creating parallel editor shells. Treat editor work as cross-cutting and verify extension registry, slash or insert entry points, controller/runtime plumbing, affordances, and selection semantics still compose correctly.
- Keep `src/client/components/editor/editor-runtime-context.ts` operational only, and keep `src/client/components/editor/editor-affordance-context.ts` authoritative for UI editing affordances.
- Keep the authenticated workspace surface and the share surface aligned through shared primitives rather than parallel rewrites.
- When changing collaboration or route-loading behavior, verify both member and share flows and update focused regression coverage, including `tests/e2e/specs/08-rapid-page-navigation.spec.ts`, `tests/e2e/specs/10-shared-rapid-navigation.spec.ts`, and `tests/e2e/specs/12-canonical-page-cold-deep-link.spec.ts` when applicable.

### Worker

- Register HTTP behavior in the owning module under `src/worker/routes/` and keep top-level wiring in `src/worker/router.ts`.
- Keep page-access resolution and viewer-surface context in `src/worker/lib/permissions.ts`. Reuse `resolvePrincipal`, `resolvePageAccessLevels`, and `toResolvedViewerContext` from routes and WebSocket auth instead of re-encoding share walks or member-vs-share branching inline.
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

Known gaps that are intentionally deferred. Do not fix these unless the task explicitly calls for them.

- `page_shares.page_id` still lacks `ON DELETE CASCADE`; app code handles deletion order today.
- Uploads still flow through the Worker instead of presigned R2 URLs. Acceptable at current scale.
- Replacing or deleting document images leaves orphaned R2 blobs. Cleanup is deferred to a future explicit GC feature.
- Workspace deletion does not proactively clear every DocSync Durable Object; rely on eventual eviction unless the task is specifically about cleanup.
- The default Playwright harness reuses one seeded `bland` workspace; specs that depend on a short or empty tree should create isolated workspaces.
- AI rewrite and generate output is still plain-text parsed into paragraphs and bullet lists only; richer structure is deferred.
- Refresh token rotation is deferred; the `bland_refresh` JWT is reused until expiry.

## Entrypoints

- Project runtime: `package.json`, `wrangler.jsonc`
- Shared contracts: `src/shared/entitlements/`, `src/shared/types.ts`, `src/shared/doc-messages.ts`, `src/shared/ai.ts`
- Client shell and routing: `src/client/route-tree.tsx`, `src/client/components/root-shell.tsx`
- Client workspace surfaces: `src/client/components/workspace/`, `src/client/components/active-page/`, `src/client/components/page-mention/`, `src/client/components/share/`
- Editor and client state: `src/client/components/editor/`, `src/client/lib/affordance/`, `src/client/stores/workspace-store.ts`, `src/client/lib/api.ts`, `src/client/lib/*-model.ts`, `src/client/lib/ai/`
- Worker entrypoints and permissions: `src/worker/index.ts`, `src/worker/router.ts`, `src/worker/routes/`, `src/worker/lib/permissions.ts`, `src/worker/lib/ai/`
- Data and runtime backends: `src/worker/db/*/schema.ts`, `src/worker/durable-objects/`, `src/worker/queues/search-indexer.ts`
