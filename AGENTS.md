# AGENTS.md

## Rules To Remember

"Can we do more with less code?"

"Do the hard things now, or be forced to do harder things in the future."

These rules are ordered, not contradictory.

Start with the smallest correct implementation that preserves correctness,
performance, security, and clarity. Prefer the smallest diff when the problem is
truly local.

If the smallest diff creates known fragility, blurred ownership, or an
architectural dead end, pay the structural cost now instead of layering another
shortcut on top.

Keep ownership explicit: routes compose layout and synchronous guards, providers
or components own async resolution and state machines, stores hold durable
snapshots and cache, and view components render already-derived state plus
page-local actions.

If a larger abstraction is merely optional, present it as an option instead of
making it the default.

## Product Contract

- The product name is `bland`, always lowercase.
- Do not use Notion framing in code, comments, or user-facing copy. Internal
  product/design docs may mention Notion as an anti-reference, but do not
  describe `bland` as a clone or make Notion part of product copy.
- `bland` is live in production. Treat live code, runtime bindings,
  `wrangler.jsonc`, active schema sources, and shared contracts as authoritative.

## Source Of Truth

- Start with the live code. Historical docs are secondary unless the task
  explicitly asks for history or rationale.
- Do not maintain entrypoint maps in this file. Use `rg --files`,
  `package.json`, `wrangler.jsonc`, `vitest.config.ts`, and nearby callers,
  tests, or modules for discovery.
- Untracked docs are WIP. Ignore them unless the user explicitly names them.
- `PRODUCT.md`, `DESIGN.md`, and the impeccable design skill own product tone,
  visual design, and UX craft. Do not duplicate design-system taste rules here.
- `docs/frontend-spec.md` is the active shared frontend standard for
  `limic.dev` conventions. Use it when touching client UI/UX, shared product
  chrome, React Compiler compatibility, or cross-project frontend conventions;
  live `bland` code, package versions, and config win for project-specific
  architecture.
- `docs/d1-vs-do-content-storage.md` is the storage ADR explaining why document
  snapshots and FTS moved out of D1 into Durable Object SQLite.
- `docs/bland-production-spec.md`, `docs/bland-sites-architecture.md`, and
  `docs/editor-v2-tiptap.md` are historical or rationale docs. The live tree
  wins when they disagree with code.
- The live editor is the custom Tiptap/ProseMirror implementation. Older
  BlockNote references are stale unless explicitly framed as history.
- The shared editor schema contract must stay Worker-safe and free of React,
  CSS, DOM, uploads, collaboration, suggestions, slash commands, and other
  client behavior.

## Working Rules

- Read before you edit. For non-local changes, read the target file plus at
  least one caller, consumer, sibling module, or focused test before changing
  code.
- Do not speculate when the live code, logs, types, or runtime can answer the
  question quickly.
- Do not treat repo-answerable technical constraints as product-choice
  questions. Inspect live code, config, tests, and local docs first; ask the
  user only for product direction or missing external context the repo cannot
  answer.
- Unless the user explicitly asks for a modification, treat the repository,
  working tree, index, and staged or unstaged changes as read-only.
- Do not run destructive git or index-mutating commands such as `git add`,
  `git reset`, `git restore`, `git checkout`, `git stash`, or `git commit`
  unless the user explicitly asks for that operation.
- Multiple agents may be working in parallel. Do not revert or reshape
  unrelated changes.
- Re-open relevant files when uncertain. Do not rely on stale session memory or
  inferred intent over current repo state.
- Do not declare root cause, safety, or completion from inference alone. Read
  back the changed surface and run the relevant check, or state plainly why a
  check was not run.
- Keep bug reports, repros, and regressions grounded in actions a human can
  actually perform in a browser. If the only trigger path is an impossible
  synthetic transition, it is not a product bug.
- Assume the dev server may already be running. Do not start `npm run dev`
  unless the task clearly requires it.

## Architecture Invariants

- Core architecture is stable: React SPA, Cloudflare Worker API, D1, Durable
  Objects for document sync and search indexing, R2 for uploads, the `SITES`
  R2 bucket plus Cache API for derived Sites artifacts, and Queues for derived
  search indexing.
- D1 is authoritative for relational metadata and control-plane state: users,
  workspaces, memberships, invites, shares, upload metadata, publication state,
  and Worker-readable page metadata projections.
- tessera owns human identity and verified email. bland owns local JWT sessions,
  workspace memberships, roles, and product authorization. One verified tessera
  `sub` maps to exactly one `users.id`, and a bland user has at most one
  tessera identity.
- First-user and new-user bootstrap should flow through OIDC identity binding,
  not password login or seed-script paths, unless the user explicitly asks for a
  product change.
- `pages.title` is a Worker-readable projection updated from DocSync saves in
  the current architecture. Do not treat title edits as ordinary `PATCH /pages`
  metadata writes unless intentionally changing that flow.
- DocSync Durable Object local SQLite is authoritative for persisted Yjs
  document content. Live collaborative document state belongs in the
  per-document Durable Object; presence and cursor state are ephemeral and must
  not be persisted.
- WorkspaceIndexer Durable Object local SQLite is authoritative for the derived
  FTS index. Search is rebuildable; Worker routes must post-filter results
  against D1 for archived and access checks.
- Uploads are scoped blobs in R2 with D1 metadata. Document assets are
  page-scoped through `uploads.page_id`; workspace-scoped uploads use
  `page_id = null` and are currently used for profile pictures. Broad
  cross-page reuse is a known limitation. Page-scoped reads are Worker-gated by
  member auth or share-token page access; workspace-scoped reads are currently
  authenticated-cookie gated.
- The `SITES` bucket stores derived public page JSON artifacts. Public HTML is
  rendered by the Worker and cached in Cache API. Access control and public
  reachability must remain D1-backed.
- The Worker orchestrates cross-runtime calls. Keep boundaries to a single hop
  from the Worker and do not add Durable Object to Durable Object calls.
- Durable Object RPCs should return tagged unions for expected outcomes and
  reserve `throw` for unrecoverable failures. Use `blockConcurrencyWhile` only
  in constructors for setup or migration, never in RPC methods.
- DocSync RPC methods must not rely on partyserver instance state such as
  `this.document` or `this.name`; RPC can bypass live connection initialization.
  Pass identifiers explicitly and read persisted state from DO SQLite.
- D1 access should flow through the request/session helpers. Mutating requests
  prefer primary reads; GETs use propagated bookmarks or unconstrained replica
  reads. Multi-statement D1 atomicity is `db.batch()`, not `db.transaction()`.
- Preserve D1 bookmark propagation between the Worker and client API layer.

## Security And Access

- Refresh tokens live in the `bland_refresh` cookie. Access tokens are stored
  only in client memory; they are sent as bearer headers for HTTP API calls and
  as DocSync connection params where required.
- Auth, tessera/OIDC, invites, refresh cookies, uploads, share links, AI, and
  site publishing are security-sensitive. Keep them fail-closed and do not
  weaken issuer, cookie, origin, publication, permission, or rate-limit checks.
- Loopback-only insecure OIDC issuer/discovery allowances and local rate-limit
  bypasses are intentional for local development only. Do not extend them beyond
  loopback request or issuer hostnames.
- Do not log secrets, bearer tokens, refresh cookies, password material, share
  tokens, OIDC authorization codes, ID tokens, transaction cookies, or client
  secrets.
- Prefer security-sensitive worker helpers in
  `src/worker/lib/{auth,origins,membership,permissions}.ts` rather than
  re-encoding auth, origin, membership, or access logic inline. Do not add new
  inline security logic when an existing helper covers it.
- Shared surfaces are route-scoped, not auth-scoped. On shared routes, a
  `?share=` token remains the authority even when the viewer also has member
  auth. Do not silently upgrade shared views into canonical member semantics.
- Page mentions store only `pageId` in document content. Resolve titles, icons,
  reachability, and navigation from the current viewer context so restricted
  metadata does not leak.
- AI features are member-only. Shared-surface entitlements deny every AI action
  by default. AI suggestions stay transient on the client and must not be
  persisted as Yjs marks or server-side artifacts.
- New AI routes must go through `createAiClient`, `RL_AI`, and
  `getPageAiEntitlements`; do not call the `AI` binding directly from routes.

## Frontend Boundaries

- Preserve the split between `src/client`, `src/worker`, and `src/shared`.
- Keep asynchronous route and page data loading in providers or components, not
  route `beforeLoad`. Use `beforeLoad` only for local auth and redirect guards.
- Workspace/page identity and active-page state belong to the workspace view
  provider, active-page provider, Dexie commands, and projection stores.
  TanStack Query is for orthogonal server-state reads and focused mutations
  outside workspace/page identity, such as share resolution, shared inbox,
  search, ancestors, page shares, and Sites status or publishing state.
- Dexie tables are durable local projections. Small Zustand stores are
  in-memory read models. Bootstrap code owns owner validation, hydration,
  route-change rehydration, and cache clearing.
- OIDC start and callback are top-level navigations, not JSON API calls.
  Post-OIDC redirects must force blocking refresh and owner validation before
  rendering cached workspace or Dexie state, then remove the one-shot marker.
- `/$workspaceSlug/$pageId` treats the slug as decorative for page routes.
  Prefer page context by `pageId` when online and authenticated, then canonical
  slug redirects. Avoid slug-first rewrites for page deep links.
- `/s/:token` is token-scoped even for authenticated members. Keep shared
  navigation and mention resolution inside the shared shell.
- Active-page logic is the page snapshot, cache, and live-state machine.
  Canonical and shared wrappers supply surface-specific inputs, cache side
  effects, metadata listeners, and mention surfaces.
- `useDocSyncSession` is the shared DocSync session path for document-like
  surfaces including docs and canvases. Cold uncached live sessions must fetch
  the Worker page snapshot before connecting the Yjs provider.
- Application API calls stay centralized in the client API layer. Direct fetch
  exceptions must stay narrow and documented, such as gated upload blob reads or
  external image URL validation.
- Prefer discriminated unions, derived state, reducers, event handlers, and pure
  helpers over adding another `useEffect`. Treat `useEffect` dependency arrays
  as correctness-critical.
- Use request guards for async effects that can overlap during navigation or
  provider remounts. Use structured worker error codes and failure classifiers;
  do not branch on error-message text.
- For UI primitive work, check `src/client/components/ui/README.md`. Its useful
  contracts are portal ownership through `<DropdownPortal>`, z-layer
  reservations, button/toolbar ownership, motion tokens, and documented
  exceptions. Treat it as the target contract for new work, without doing
  unrelated cleanup of older drift.

## Editor And Rendering

- Extend the shared editor instead of creating parallel editor shells. Editor
  work is cross-cutting: extension registry, slash or insert entry points,
  controller/runtime plumbing, affordances, selection semantics, static
  rendering, and tests must compose together.
- When changing editor nodes, marks, attrs, parse/render HTML, or document JSON
  shape, update the matching schema, client adapters, pure presentation
  components, Sites static rendering, and focused schema/static rendering tests
  in the same diff.
- Keep client-only behavior in client adapters. Keep static rendering explicit
  so internal attrs and restricted metadata are not leaked.
- Keep `src/shared/editor/highlight/code-highlight-runtime.js` behind its local
  `.d.ts` facade. `highlight.js` declarations pull in `lib.dom`, so converting
  this runtime to TypeScript leaks DOM types into Worker/Sites typechecking.
- Keep operational editor runtime context separate from UI editing affordance
  policy.
- Canvas is a full-page kind sharing DocSync, not an editor block. It uses
  separate Yjs roots and must not write Excalidraw image data URLs into Yjs;
  durable image state is the `fileId -> uploadId` mapping.
- Callout kind, page-mention attrs, and other persisted node attributes are
  shared document state. Menu open state, focus, expanded local UI, and similar
  view details are local UI state.

## Worker, Sites, And Data

- Register HTTP behavior in the owning route module and keep top-level wiring
  thin.
- Validate requests at the boundary with `zod` or shared schemas.
- Put reusable worker logic in helpers or middleware instead of bloating route
  handlers.
- Keep 4xx failures explicit and actionable. Reserve 500s for genuinely
  unexpected errors.
- Sites host dispatch must run before `/api`, `/uploads`, assets, and SPA shell
  routing. Public site hosts own every path under that host.
- Public Sites HTML may serve request-keyed Cache API hits before D1 and can be
  stale for the bounded internal TTL documented in
  `docs/sites-cache-performance-research.md`. Do not cache redirects or 404s.
- Public Sites assets remain D1-first: gate by the requested page, upload
  ownership, site publication, and published-set reachability before R2 reads.
- Sites rendering uses the Worker-safe editor schema and Sites static renderer,
  never client editor modules.
- Sites mention rendering must pre-resolve mentions for the current published
  set and redact unreachable `pageId`s before emitting public HTML.
- Public Sites assets are gated by the requested page, upload ownership, site
  publication, and published-set reachability. Use 404 for failed public asset
  gates to avoid existence leaks.
- Queue messages for search indexing should stay small, normally `pageId`.
  Consumers can race D1 visibility and should retry expected not-yet-visible
  rows.
- Edit schema sources first. Do not hand-edit generated files under `drizzle/`
  unless the task explicitly calls for a hand-written migration.
- If request or response shapes change, update both the worker boundary and
  shared types. If DocSync custom message shapes change, update the shared
  DocSync message contract.

## Validation

- For most code changes, run `npm run typecheck` and `npm run lint`.
- Also run `npm run build` when route wiring, bundling, runtime registration,
  Worker exports, or asset generation behavior changes.
- Add or update focused Vitest or Playwright coverage when behavior becomes
  non-trivial, security-sensitive, or cross-surface.
- Npm lifecycle and `pre*` scripts may generate local artifacts such as emoji
  data. Today `npm run typecheck`, `npm run build`, and `npm run test` trigger
  `emoji:generate`; `npm run lint` does not. Inspect scripts before running
  broad npm commands.
- Vitest projects are split by runtime. Use Node/client tests for pure logic,
  DOM tests for browser storage and lifecycle behavior, and Worker runtime tests
  only when Cloudflare bindings, D1, Durable Objects, assets, or Worker request
  handling are material.
- The Cloudflare Worker runtime test harness is slow. Prefer focused worker unit
  coverage for pure worker logic.
- For collaboration, route-loading, or shared-surface changes, verify both
  member and share flows. Include the rapid-navigation and cold-deep-link E2E
  specs when that behavior is touched.
- For Sites changes, include focused shared/static renderer, worker Sites, and
  Sites publish E2E coverage as applicable.
- The E2E harness applies local D1 migrations, seeds a baseline tessera-bound
  user/workspace, starts the mock OIDC provider, injects OIDC env, and starts
  its own isolated dev server. Do not start `npm run dev` just to run E2E unless
  the task explicitly requires manual debugging outside the harness.
- Use `BLAND_E2E_PRESERVE=1 npm run test:e2e` when debugging E2E failures.
- Use `npx prettier --check <paths>` or `npm run format:check` for formatting
  verification when formatting changed files matters.

## Deferred Work

Known gaps that are intentionally deferred. Do not fix these unless the task
explicitly calls for them.

- `page_shares.page_id` still lacks `ON DELETE CASCADE`; app code handles
  deletion order today.
- Uploads still flow through the Worker instead of presigned R2 URLs.
  Acceptable at current scale.
- Replacing or deleting document images leaves orphaned R2 blobs. Cleanup is
  deferred to a future explicit GC feature.
- Workspace deletion does not proactively clear every DocSync Durable Object;
  rely on eventual eviction unless the task is specifically about cleanup.
- The default Playwright harness reuses one baseline tessera-bound `bland`
  workspace; specs that depend on a short or empty tree should create isolated
  workspaces.
- AI rewrite and generate output is still plain-text parsed into paragraphs and
  bullet lists only; richer structure is deferred.
- Refresh token rotation is deferred; the `bland_refresh` JWT is reused until
  expiry.
- Stage 1 keeps `users.password_hash` with `PASSWORD_DISABLED_SENTINEL` for
  tessera-bound accounts; dropping the column is deferred to Stage 2.
- RP-initiated tessera logout is deferred; `/auth/logout` clears only bland
  session cookies.
