# tessera integration plan

## Purpose

Replace bland's email+password sign-in with tessera-issued OIDC identity while keeping bland's local JWT sessions and product authorization unchanged. This document is the source of truth for the integration; it pins the boundary, the identity-binding invariant, the callback state matrix, the test cells, the file-by-file changes, and the two-stage delivery.

## Identity-binding invariant

One verified tessera `sub` maps to exactly one bland `users.id`; one bland user has at most one tessera identity; `users.email` is a tessera-owned profile projection used only as a one-time bind lookup and never as the long-term identity key.

## Boundary decision

- **tessera owns**: human identity, password storage, verified email, bot protection on the identity flow, account linking across providers.
- **bland keeps**: HS256 access tokens (via `jose`), `bland_refresh` cookie (HttpOnly, 7-day, non-rotating), `bland_has_session` hint cookie, `requireAuth` middleware, DocSync admission via `?token=`, workspace memberships and role RBAC, page/share authorization, share-token surfaces, R2 uploads gating, Sites publication checks, D1 bookmark propagation, Dexie local-replica ownership.
- **OIDC uses `openid-client` only**. tessera ID tokens are validated in the callback and discarded; we never store them or send them to a Durable Object.

## Callback host policy

Both `bland.tools` and `docs.limic.dev` are bland app custom domains that reach the SPA router (Sites dispatch matches only `PUBLISHED_SITE_DOMAIN`, currently `bland.site`). tessera supports multiple redirect URIs per client, so the chosen deploy shape is to register both callbacks:

- `https://bland.tools/api/v1/oidc/callback`
- `https://docs.limic.dev/api/v1/oidc/callback`

The OIDC start route derives `redirect_uri` from `new URL(c.req.url)`'s origin and validates it against `ALLOWED_ORIGINS` via `isAllowedOrigin`. The transaction cookie is `__Host-bland_oidc_tx` with `Secure`, `HttpOnly`, `Path=/`, `SameSite=Lax`, `maxAge=300s` — the same shape in dev and prod. Modern browsers (Chrome, Firefox, Safari) treat `localhost` and `127.0.0.1` as potentially-trustworthy origins, so `Secure` cookies (and therefore `__Host-` prefixed cookies) are accepted over loopback HTTP. No dev/prod cookie-name branching is needed.

## OIDC routes

Both routes mount under `/api/v1` and use `RL_AUTH`.

### `GET /api/v1/oidc/start`

- Validates `redirect_uri` derivable from request origin against `ALLOWED_ORIGINS`.
- Reads and sanitizes `return_to` query param (rules below).
- Generates PKCE verifier+challenge (`oidc.randomPKCECodeVerifier`, `oidc.calculatePKCECodeChallenge`), `state` (`oidc.randomState`), `nonce` (`oidc.randomNonce`).
- Sets signed transaction cookie with HKDF-derived key from `TESSERA_OIDC_CLIENT_SECRET` (purpose string `"bland-oidc-transaction-v1"`); payload `{ state, nonce, codeVerifier, redirectUri, returnTo, createdAt }` base64url-encoded JSON.
- Calls `oidc.discovery(new URL(issuer), clientId, undefined, oidc.ClientSecretPost(clientSecret), discoveryOptions)`. Discovery is cached at module level by issuer URL string, 5-minute TTL. `discoveryOptions` opts into `oidc.allowInsecureRequests` only when the issuer hostname is loopback.
- Calls `oidc.buildAuthorizationUrl(config, { redirect_uri, code_challenge, code_challenge_method: "S256", state, nonce, scope: "openid email profile" })`.
- Returns 302 to the authorization URL.

### `GET /api/v1/oidc/callback`

- Reads transaction cookie via `getSignedCookie`. If missing/tampered/expired, clear cookie and redirect to `/login?error=oidc_session_expired`.
- Verifies `state` query param matches cookie payload.
- Validates `redirect_uri` host matches request host (defense in depth — the `__Host-` cookie already guarantees this in production).
- Calls `oidc.authorizationCodeGrant(config, callbackUrl, { pkceCodeVerifier: payload.codeVerifier, expectedNonce: payload.nonce, expectedState: payload.state })`. The returned token set is queried via `tokens.claims()` (the openid-client v6 helper that returns the validated ID-token claims).
- Validates claims: nonempty `sub`, `email_verified === true`, usable `email` string, optional `name`. Anything missing → clear tx cookie, redirect `/login?error=oidc_<short_code>`. **No exception for already-bound `sub`**: if `email_verified !== true`, fail closed.
- Runs the identity-binding matrix.
- On success: clear tx cookie, mint bland access token + set `bland_refresh` + `bland_has_session` via existing `setRefreshCookie()`, then redirect 302 to validated `return_to` with the one-shot marker `oidc=1` appended (preserving any existing query string). The D1 bookmark from the callback's writes is propagated to the SPA via the subsequent `/auth/refresh` response, not via the redirect — see the D1 bookmark and identity-swap sections.

## Identity-binding state/transition matrix

| #   | Pre-state                                                                               | Outcome                                                                                                                                                    | DB writes                                                                             | Token mint     | Redirect                              |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------- |
| M1  | `tessera_identities.sub` exists, email matches existing                                 | sign in existing user                                                                                                                                      | UPDATE `tessera_identities.last_seen_at`                                              | yes            | `return_to`                           |
| M2  | `tessera_identities.sub` exists, tessera email changed to a free email                  | sign in same user, update email projection                                                                                                                 | UPDATE `users.email`; UPDATE `tessera_identities.last_seen_at`                        | yes            | `return_to`                           |
| M3  | `tessera_identities.sub` exists, tessera email collides with another bland user's email | **fail closed**                                                                                                                                            | none                                                                                  | no             | `/login?error=tessera_email_conflict` |
| M4  | new `sub`, verified email matches unbound legacy bland user                             | bind identity to existing user                                                                                                                             | INSERT `tessera_identities` (onConflictDoNothing, with `.returning()` to confirm row) | yes            | `return_to`                           |
| M5  | new `sub`, verified email matches already-bound user (different sub)                    | **fail closed**                                                                                                                                            | none                                                                                  | no             | `/login?error=identity_conflict`      |
| M6  | new `sub`, new email                                                                    | create user + identity + default workspace + owner membership                                                                                              | `db.batch` (4 inserts; IDs generated upfront with `ulid()`)                           | yes            | `return_to`                           |
| M7  | racing M6 for same `sub`                                                                | exactly one batch wins                                                                                                                                     | loser re-reads canonical user via `findUserByTesseraSub`                              | yes (for both) | `return_to`                           |
| M8  | `email_verified !== true` or missing email                                              | **fail closed**                                                                                                                                            | none                                                                                  | no             | `/login?error=oidc_unverified_email`  |
| M9  | missing/tampered/expired tx cookie OR bad state                                         | **fail closed**                                                                                                                                            | none                                                                                  | no             | `/login?error=oidc_session_expired`   |
| M10 | failed discovery OR failed token exchange                                               | **fail closed**                                                                                                                                            | none                                                                                  | no             | `/login?error=oidc_provider_error`    |
| M11 | callback while existing bland session, same sub                                         | idempotent: update `last_seen_at`, mint fresh tokens                                                                                                       | per M1/M2                                                                             | yes            | `return_to` (with `oidc=1` marker)    |
| M12 | callback while existing bland session, different sub                                    | sign in the new sub; old session is replaced server-side; SPA must block render until refresh + owner validation complete (see Post-OIDC client bootstrap) | per matching row of M1/M2/M4/M6                                                       | yes (new sub)  | `return_to` (with `oidc=1` marker)    |

Implementation flow for `binding(claims) → outcome`:

```
existing = findUserByTesseraSub(db, sub)
if (existing) {
  if (existing.email !== claims.email) {
    try { UPDATE users SET email = claims.email WHERE id = existing.id }
    catch (UNIQUE) { return M3 }
  }
  UPDATE tessera_identities SET last_seen_at = now WHERE sub = claims.sub
  return M1 or M2
}

legacyByEmail = SELECT users WHERE email = claims.email
if (legacyByEmail) {
  inserted = INSERT INTO tessera_identities (sub, user_id)
             VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING sub
  if (inserted.length === 1) return M4
  // lost race: another callback bound this sub or this user
  recheck = findUserByTesseraSub(db, sub)
  if (recheck && recheck.id === legacyByEmail.id) return M4 (raced ourselves; benign)
  return M5
}

// brand new: M6 with race-safe pattern
userId = ulid(); workspaceId = ulid()
try {
  db.batch([
    INSERT INTO users (id=userId, email=claims.email, name=claims.name||fallback,
                       password_hash=PASSWORD_DISABLED_SENTINEL),
    INSERT INTO tessera_identities (sub, user_id=userId),
    INSERT INTO workspaces (id=workspaceId, name, slug=defaultSlugWithIdSuffix(name, workspaceId),
                            owner_id=userId),
    INSERT INTO memberships (user_id=userId, workspace_id=workspaceId, role="owner"),
  ])
  return M6
} catch (UNIQUE on sub OR users.email) {
  recheck = findUserByTesseraSub(db, sub)
  if (recheck) return M7 (sign in canonical)
  // email collided with a user that isn't ours -> identity conflict
  return M5
}
```

`users.name` is `NOT NULL` in the existing schema. tessera seeds `name` only on M6 (with a sane fallback derived from the email local part if the `name` claim is missing). M1/M2/M4 do **not** touch `users.name`; users keep any bland-local name they may have set.

## Schema

New table in `src/worker/db/d1/schema.ts`:

```ts
export const tesseraIdentities = sqliteTable(
  "tessera_identities",
  {
    sub: text("sub").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    last_seen_at: text("last_seen_at"),
  },
  (table) => [uniqueIndex("idx_tessera_identities_user_id").on(table.user_id)],
);
```

Migration: `drizzle/d1/0004_tessera_identities.sql` (drizzle-kit generated; do not hand-edit unless explicitly required by review).

Test helpers (`tests/worker/helpers/*`) — add `tessera_identities` to deletion order before `users` in `resetD1Tables`. `ON DELETE CASCADE` is also declared on the FK as defense in depth.

## `return_to` sanitization

Apply at both `/oidc/start` query parse and `/oidc/callback` cookie restore (defense in depth):

```ts
export function sanitizeReturnTo(raw: string | undefined): string {
  if (!raw) return "/";
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  if (v.includes("://") || v.includes("\\")) return "/";
  if (/[\x00-\x1f\x7f]/.test(v)) return "/";
  return v;
}
```

## Password sentinel

In `src/worker/lib/auth.ts`:

```ts
export const PASSWORD_DISABLED_SENTINEL = "tessera!disabled";
```

`verifyPassword(password: string, stored: string)` short-circuits `false` when its second argument equals `PASSWORD_DISABLED_SENTINEL` — before any Argon2 PHC parse. The sentinel is `!`-bearing so it is definitively non-PHC.

Stage 2 deletes both the constant and the helper module if no remaining caller exists.

## Profile semantics

- `users.email`: tessera-owned. Updated on every callback from verified tessera email (M2, with M3 conflict handling). Profile UI is display-only.
- `users.name`: bland-local after first creation. tessera seeds `name` only on M6. `PATCH /api/v1/auth/me` (`UpdateProfileRequest`) accepts `name` and `avatar_url`; no email field exists today, so no email-update rejection path is needed.
- `users.avatar_url`: bland-local. Not derived from tessera; existing R2 avatar uploads continue.

## Invite changes

- `GET /api/v1/invite/:token` (preview): unchanged, public.
- `POST /api/v1/invite/:token/accept`: now **strictly auth-required** via `requireAuth`. Body no longer accepts `email`/`password`/`name`/`turnstileToken`. The existing conditional `UPDATE invites` + `INSERT-SELECT memberships` atomicity gate (`src/worker/routes/invites.ts:267-294`, including the `.returning({ id: invites.id })` claim probe) is preserved and remains the concurrency authority.
- Email-pinned compare: `invite.email === c.get("user")!.email.toLowerCase()`.

Client invite page (`src/client/components/auth/invite-page.tsx`):

- Drop password/name fields and Turnstile widget.
- Unauthenticated state: single CTA `Sign in with tessera to accept`. The `return_to` query value is built with `URLSearchParams` so the nested `?accept=1` is properly encoded, e.g. `` `/api/v1/oidc/start?${new URLSearchParams({ return_to: `/invite/${token}?accept=1` })}` ``, which yields `return_to=%2Finvite%2F...%3Faccept%3D1`. Never concatenate raw paths into the query string.
- Authenticated state: single `Accept invite` button.
- When `?accept=1` AND `useAuth.isAuthenticated`, auto-submit the accept POST on mount. State machine: `awaiting-bootstrap` → `accepting` → `accepted | failed`. Cover via focused client test.

Session bootstrap (`src/client/lib/session-bootstrap.ts`): extend `getSessionBootstrapStrategy()` so that when `bland_has_session === "1"`, `/invite/:token` is treated as `block`-on-refresh (currently public). The post-OIDC `oidc=1` marker (see Post-OIDC client bootstrap) takes precedence and forces `block` regardless of stored user. Add a client test for both rules.

## Turnstile removal (Stage 1)

Delete:

- `src/worker/middleware/turnstile.ts` and all imports.
- Turnstile gates in `src/worker/routes/auth.ts` (`POST /auth/login` is being deleted entirely).
- Turnstile gates in `src/worker/routes/invites.ts` accept endpoint.
- `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` entries from `.dev.vars.example` (these are not present in `wrangler.jsonc` root vars today; if production has Turnstile secrets set via `wrangler secret put`, delete them after deploy).
- `<TurnstileWidget/>` from `src/client/components/auth/login-page.tsx` and `invite-page.tsx`.
- Any public config field exposing `TURNSTILE_SITE_KEY` to the client.
- CSP `script-src` Turnstile allowance.
- All Turnstile test references.

## Routes deleted (Stage 1)

- `POST /api/v1/auth/login`: deleted entirely (not a stub).
- Client `api.auth.login()` removed from `src/client/lib/api.ts`.
- `useAuth().login()` removed from `src/client/hooks/use-auth.ts` (keep `logout()`; refresh path stays implicit via api layer).

## Routes preserved (Stage 1)

- `POST /api/v1/auth/refresh`: unchanged. Continues to consume `bland_refresh`, mint a fresh access token, and rotate nothing.
- `POST /api/v1/auth/logout`: unchanged — clears `bland_refresh` + `bland_has_session`. RP-initiated tessera logout via `end_session_endpoint` is **deferred** (see Deferred Work).
- `GET /api/v1/auth/me`: unchanged.
- `PATCH /api/v1/auth/me`: continues to accept `name` / `avatar_url`.

## Client API auto-refresh

The OIDC callback and start routes are top-level navigations, not JSON API calls — `sendApiRequest` never sees their responses. No change is required to the 401 auto-refresh logic in `src/client/lib/api.ts`. Document the assumption inline so a future refactor that funnels OIDC responses through `sendApiRequest` knows to add an exclusion.

## DocSync admission

**Unchanged.** Client passes `?token=<accessToken>` (bland HS256 JWT) to the DocSync Durable Object connection upgrade. Token refresh on close stays in `decideDocSyncRefresh()`. tessera tokens are never sent to a Durable Object.

## D1 bookmark propagation

The OIDC callback is a top-level 302 navigation; browser JS cannot persist custom response headers from a redirect, so attaching the bookmark to the redirect response itself accomplishes nothing on the client. Today `refreshSession()` in `src/client/lib/api.ts:52` calls `requestSessionRefresh()` directly with `fetch()` and does **not** invoke `persistBookmark()`. So even though the Worker's session DB attaches `D1_BOOKMARK_HEADER` to the refresh response, the SPA currently discards it.

Stage 1 must update `refreshSession()` to call `persistBookmark(res)` on the successful refresh path. After the OIDC callback, the SPA's post-OIDC bootstrap calls `/auth/refresh` (POST, `first-primary`), the Worker session DB returns the latest bookmark in the response header, and `persistBookmark()` stores it. Subsequent GETs (workspaces, invite preview, page reads) include the stored bookmark and observe M4/M6 writes.

Tests:

- focused unit: `refreshSession()` persists the response bookmark when the header is present, leaves storage untouched on failure
- worker → E2E: first-time OIDC callback writes propagate via the refresh-response bookmark to a subsequent `/workspaces` GET

## Post-OIDC client bootstrap

The OIDC callback redirects to `return_to` with the one-shot marker `oidc=1` appended (built via `URLSearchParams` so existing query keys are preserved without clobbering). The SPA detects the marker and forces a synchronous refresh + owner validation pass before rendering any cached user data, then strips the marker from the URL.

Concretely, `getSessionBootstrapStrategy()` in `src/client/lib/session-bootstrap.ts` grows a new injectable argument (e.g. `search?: string` or `href?: string`, mirroring the existing `cookieHeader` injection point) and gains a new pre-check that runs before the existing `hasStoredUser`/hint-cookie branches:

```
if (new URLSearchParams(search).has("oidc")) return "block";
```

The caller in `src/client/main.tsx` (or the bootstrap entry) passes `location.search` (or the full `location.href`) in, preserving the helper's test contract — the function stays pure and injectable for DOM tests.

After the `block` strategy completes (refresh + owner validation), the SPA strips the `oidc` query param via `history.replaceState()` so a subsequent reload does not re-trigger the block.

This rule is what makes M11 and M12 correct across the cross-boundary case: even if the SPA has a stored user from a prior session (Zustand persisted state, Dexie local-replica owner), the marker forces full revalidation against the freshly-minted bland JWT and a fresh owner check for Dexie. Without the marker, M12 could render stale workspace lists and Dexie data for the previous user before refresh completes.

Tests:

- DOM: `getSessionBootstrapStrategy()` returns `"block"` when `oidc=1` is present in the URL, even with a stored user
- DOM: after the post-OIDC `block` path completes, the URL no longer contains `oidc=1`
- E2E: M11 (same sub) callback into existing stored user → SPA renders same user, no flicker
- E2E: M12 (different sub) callback into existing stored user → SPA never renders the prior user's data before refresh completes

## tessera issuer URL policy

In `src/worker/lib/oidc.ts` on first call (lazy init):

- Normalize `TESSERA_OIDC_ISSUER` (strip trailing slash).
- Require HTTPS unless hostname is loopback (`localhost`, `127.0.0.1`, `::1`).
- Throw fail-closed at first use on invalid config.
- After discovery, re-validate the returned `authorization_endpoint`, `token_endpoint`, and `jwks_uri` against the same policy.

## Worker test seam

`src/worker/lib/oidc.ts` exports an internal `__test` namespace, reachable only from test code via direct module import (not via HTTP):

```ts
export const __test = {
  setProviderForTesting(issuer: string, config: oidc.Configuration): void { ... },
  setAuthorizationCodeGrantImpl(
    fn: ((c: oidc.Configuration, url: URL, opts: oidc.AuthorizationCodeGrantChecks)
         => Promise<{ claims(): IdTokenClaims }>) | null,
  ): void { ... },
  clear(): void { ... },
};
```

Tests preload a hand-constructed `oidc.Configuration` (mirroring goc's `test/util/oidcFake.ts`) and stub the token-grant step to return an object whose `.claims()` returns the desired ID-token claims.

## File-by-file touch list (Stage 1)

New files:

- `src/worker/lib/oidc.ts` — discovery cache, transaction cookie helpers, claim validators, issuer URL policy, `__test` seam.
- `src/worker/routes/oidc.ts` — `/oidc/start`, `/oidc/callback` handlers; identity-binding logic per matrix.
- `drizzle/d1/0004_tessera_identities.sql` — drizzle-kit generated migration.
- `tests/worker/routes/oidc.workers.test.ts` — Worker runtime tests, one per matrix cell where Worker bindings matter.
- `tests/worker/lib/oidc.test.ts` — pure unit tests for issuer policy, tx cookie helpers, `sanitizeReturnTo`.
- `tests/worker/db/tessera-identities.workers.test.ts` — schema/migration tests (uniqueness, sentinel insert, legacy load).

Modified files:

- `src/worker/db/d1/schema.ts` — add `tesseraIdentities` table.
- `src/worker/lib/auth.ts` — add `PASSWORD_DISABLED_SENTINEL`; `verifyPassword` short-circuit guard. Retain JWT/cookie helpers.
- `src/worker/routes/auth.ts` — delete `POST /auth/login`; keep `/refresh`, `/logout`, `/me` (GET + PATCH).
- `src/worker/routes/invites.ts` — drop unauthenticated path and password/Turnstile fields; make accept strictly `requireAuth`; preserve atomicity gate.
- `src/worker/router.ts` — mount `oidcRouter` under `/api/v1`.
- `src/worker/middleware/turnstile.ts` — delete file.
- `wrangler.jsonc` — add `TESSERA_OIDC_ISSUER` to root `vars` (env-specific block not currently in use). `TESSERA_OIDC_CLIENT_ID` / `TESSERA_OIDC_CLIENT_SECRET` are production secrets set via `wrangler secret put` (not in `wrangler.jsonc`).
- `.dev.vars.example` — add `TESSERA_OIDC_ISSUER`, `TESSERA_OIDC_CLIENT_ID`, `TESSERA_OIDC_CLIENT_SECRET`; remove `TURNSTILE_*`.
- `src/client/components/auth/login-page.tsx` — replace password form with single tessera sign-in button linking to `/api/v1/oidc/start?return_to=...`; render `?error=` codes inline.
- `src/client/components/auth/invite-page.tsx` — drop password form / Turnstile; unauth CTA links to OIDC start with `?accept=1`; auto-submit on mount when authenticated with `?accept=1`.
- `src/client/lib/session-bootstrap.ts` — extend strategy: `/invite/:token` is `block`-on-refresh when `bland_has_session=1`.
- `src/client/hooks/use-auth.ts` — drop `login()`; keep `logout()` and identity rehydration.
- `src/client/lib/api.ts` — drop `api.auth.login`; keep `refresh`, `logout`, `me`. Update `refreshSession()` to call `persistBookmark(res)` on the successful refresh path so post-OIDC writes propagate to subsequent GETs.
- `src/client/components/auth/turnstile-widget.tsx` — delete (and call sites).
- `tests/e2e/global-setup.ts` — start `@mongodb-js/oidc-mock-provider` configured so the issued identity is selectable per request (e.g. by query param, header, or a per-spec configuration helper). Write the mock issuer/client into the isolated `.dev.vars` for the test server. Seed **one** baseline tessera identity row (`sub = e2e-baseline-sub`, email `e2e@bland.test`, workspace + owner membership) for fixtures that need an already-authenticated state. First-time-login and invite-new-user specs configure the mock provider to issue a different unseeded `sub` + email for that test only — they MUST NOT collide with the baseline.
- `tests/e2e/fixtures/bland-test.ts` — `loginPage(page)` navigates `/api/v1/oidc/start?return_to=/` (mock provider configured to issue the baseline identity), the provider auto-approves, the callback runs end-to-end, and on landing the helper calls `/api/v1/auth/refresh` to capture the access token for downstream API helper calls. A separate `loginAsFreshTesseraUser(page, { sub, email, name })` fixture configures the mock provider to issue the supplied identity for the next authorization request — used by the first-time-login spec and invite-new-user spec.
- `tests/worker/routes/invite-accept.workers.test.ts` — drop password-path tests; add tessera-bound user fixtures.
- `tests/worker/helpers/*` — add `tessera_identities` to `resetD1Tables`; add `seedTesseraIdentity(sub, userId)` helper.
- `package.json` — add `openid-client` (deps), `@mongodb-js/oidc-mock-provider` (devDeps).

## Tests mapped to matrix cells

| Cell                      | Test layer | File                                          | What it asserts                                                                                                                                                                      |
| ------------------------- | ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1, M11                   | Worker     | `oidc.workers.test.ts`                        | returning sub with matching email mints tokens, updates `last_seen_at`                                                                                                               |
| M2                        | Worker     | `oidc.workers.test.ts`                        | returning sub with changed-but-free email updates `users.email`                                                                                                                      |
| M3                        | Worker     | `oidc.workers.test.ts`                        | returning sub with email collision returns 302 to `/login?error=tessera_email_conflict`, no writes, no mint                                                                          |
| M4                        | Worker     | `oidc.workers.test.ts`                        | new sub with email matching unbound legacy user binds identity, no new workspace                                                                                                     |
| M5                        | Worker     | `oidc.workers.test.ts`                        | new sub with email matching already-bound user returns identity_conflict                                                                                                             |
| M6                        | Worker     | `oidc.workers.test.ts`                        | new sub creates user + identity + default workspace + owner membership; verify all four rows                                                                                         |
| M7                        | Worker     | `oidc.workers.test.ts`                        | two concurrent M6 callbacks for same sub → exactly one user, both responses successful                                                                                               |
| M8                        | Worker     | `oidc.workers.test.ts`                        | `email_verified=false` returns oidc_unverified_email, no writes                                                                                                                      |
| M9                        | Worker     | `oidc.workers.test.ts`                        | missing/tampered tx cookie → oidc_session_expired; expired tx cookie also fails                                                                                                      |
| M10                       | Worker     | `oidc.workers.test.ts`                        | discovery / token-exchange failure → oidc_provider_error                                                                                                                             |
| M12                       | Worker     | `oidc.workers.test.ts`                        | callback with valid existing bland session but different sub mints new tokens                                                                                                        |
| sanitize                  | Node       | `oidc.test.ts`                                | `sanitizeReturnTo` covers all reject cases                                                                                                                                           |
| issuer policy             | Node       | `oidc.test.ts`                                | `validateIssuerUrl` requires HTTPS unless loopback; endpoint re-validation rejects mismatch                                                                                          |
| tx cookie                 | Node       | `oidc.test.ts`                                | sign/verify round-trip; tamper detection; expiry; `__Host-bland_oidc_tx` + `Secure` shape (same cookie shape in dev and prod since loopback is a secure context)                     |
| sentinel                  | Node       | `auth.test.ts`                                | `verifyPassword` returns false on sentinel, never invokes Argon2                                                                                                                     |
| refresh bookmark          | Node       | `api.test.ts`                                 | `refreshSession()` persists the response bookmark when the header is present; storage untouched on failure                                                                           |
| post-OIDC marker          | DOM        | `session-bootstrap.dom.test.ts`               | `getSessionBootstrapStrategy()` returns `block` when `oidc=1` is in the URL even with a stored user; URL marker is stripped after `block` completes                                  |
| migration apply           | Worker     | `tessera-identities.workers.test.ts`          | drizzle migration applies to existing D1 schema                                                                                                                                      |
| sub uniqueness            | Worker     | `tessera-identities.workers.test.ts`          | inserting two rows with the same `sub` fails the UNIQUE/PK constraint                                                                                                                |
| user_id uniqueness        | Worker     | `tessera-identities.workers.test.ts`          | inserting two identity rows for the same `user_id` fails the unique index                                                                                                            |
| stage-1 insert            | Worker     | `tessera-identities.workers.test.ts`          | inserting a new user with `password_hash = PASSWORD_DISABLED_SENTINEL` succeeds                                                                                                      |
| legacy load               | Worker     | `tessera-identities.workers.test.ts`          | existing users without identity rows load normally until first tessera bind                                                                                                          |
| invite                    | Worker     | `invite-accept.workers.test.ts`               | auth-required accept; email-pinned mismatch 403; concurrent accept atomicity preserved                                                                                               |
| client invite             | DOM        | `invite-page.dom.test.tsx`                    | unauth CTA links to OIDC start; auth+`?accept=1` auto-submits; bootstrap flash absent                                                                                                |
| client login              | DOM        | `login-page.dom.test.tsx`                     | renders single tessera CTA; `?error=` codes render inline                                                                                                                            |
| client bootstrap          | DOM        | `session-bootstrap.dom.test.ts`               | `/invite/:token` becomes `block` when `bland_has_session=1`                                                                                                                          |
| E2E first-time            | Playwright | `tests/e2e/oidc-first-login.spec.ts`          | new tessera user (fresh `sub`/email from per-spec mock config) → default workspace → first page creation; subsequent `/workspaces` GET observes the M6 writes via refreshed bookmark |
| E2E returning             | Playwright | `tests/e2e/oidc-returning.spec.ts`            | second login → same user, no duplicate workspace                                                                                                                                     |
| E2E M11 same-sub re-auth  | Playwright | `tests/e2e/oidc-reauth-same-sub.spec.ts`      | callback while existing stored user with same sub: SPA renders same user, no flicker, marker stripped                                                                                |
| E2E M12 sub swap          | Playwright | `tests/e2e/oidc-reauth-different-sub.spec.ts` | callback while existing stored user with different sub: SPA never renders the prior user's data before refresh + owner validation complete                                           |
| E2E invite                | Playwright | `tests/e2e/oidc-invite.spec.ts`               | invite → tessera sign-in → auto-accept lands in invited workspace                                                                                                                    |
| E2E email-pinned mismatch | Playwright | `tests/e2e/oidc-invite-mismatch.spec.ts`      | mismatched email-pinned invite fails with structured error                                                                                                                           |

## Sequencing for Stage 1

1. Schema + migration: add `tessera_identities`, regenerate types.
2. `src/worker/lib/oidc.ts` + helpers (issuer policy, tx cookie, `sanitizeReturnTo`, discovery cache, `__test` seam).
3. Add `openid-client` and `@mongodb-js/oidc-mock-provider` to `package.json`; install.
4. `src/worker/routes/oidc.ts` (start + callback) + matrix logic; mount in router.
5. `wrangler.jsonc` + `.dev.vars.example`: add OIDC env vars, drop Turnstile.
6. `src/worker/lib/auth.ts`: add sentinel + `verifyPassword` short-circuit.
7. Delete `POST /auth/login` and Turnstile middleware/calls. (Worker tests will fail at this point — fix in step 8.)
8. Update `invites.ts` to strict `requireAuth`; drop password/Turnstile branches; update worker tests.
9. Client login page, invite page, session bootstrap, api layer, hooks.
10. E2E global-setup: spin up `@mongodb-js/oidc-mock-provider`; rewrite `loginPage()` fixture to drive the OIDC flow end-to-end.
11. Worker test seam wiring; cover matrix cells; add schema/migration tests.
12. Run validation (typecheck, lint, build, focused test, e2e).

## Stage 2 follow-up (separate PR)

1. Drop `users.password_hash` column via drizzle-kit migration (D1 SQLite supports `ALTER TABLE DROP COLUMN`; drizzle-kit will emit the appropriate form).
2. Delete `hashPassword`, `verifyPassword`, `PASSWORD_DISABLED_SENTINEL`, `ARGON2_PARAMS` from `src/worker/lib/auth.ts`.
3. Remove `@noble/hashes` if no remaining callers.
4. Drop any remaining password-specific request schemas and test fixtures.
5. Re-run validation.

## Validation

Run before opening PR:

- `npm run typecheck` (includes `emoji:generate` prerun)
- `npm run lint` (does NOT run `emoji:generate`)
- `npm run build` (route wiring changed)
- `npm run test` — Node/DOM + Worker projects
- `npm run test:e2e` — full Playwright run with mock OIDC provider
- `npm run format:check` or `npx prettier --check <touched paths>`

## Deployment

Production:

- Register two redirect URIs at tessera for the bland client:
  - `https://bland.tools/api/v1/oidc/callback`
  - `https://docs.limic.dev/api/v1/oidc/callback`
- Add `TESSERA_OIDC_ISSUER` to root `vars` in `wrangler.jsonc` (the current config has no `env.production` block; introducing one is out of scope for this PR).
- `wrangler secret put TESSERA_OIDC_CLIENT_ID`
- `wrangler secret put TESSERA_OIDC_CLIENT_SECRET`
- After deploy: delete any production `TURNSTILE_SECRET` / `TURNSTILE_SITE_KEY` secrets that may have been set.

Local dev: copy `.dev.vars.example` to `.dev.vars`; point `TESSERA_OIDC_ISSUER` to a dev tessera instance (loopback HTTP allowed).

## Deferred work

- RP-initiated tessera logout (`end_session_endpoint`) — `/auth/logout` clears bland cookies only; the user's tessera session remains valid in their browser.
- Refresh-token rotation remains deferred (already in CLAUDE.md Deferred Work).
- M5 ("identity conflict on bind") is a hard fail. There is no automated merge path; support intervention required.
- Workspace deletion still does not proactively clear DocSync DOs (unchanged).
- Stage 1 retains `users.password_hash NOT NULL` column with sentinel; removed in Stage 2.
