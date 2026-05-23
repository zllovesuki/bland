# OIDC Migration Guide

Operator runbook for upgrading an existing `bland` deployment from password login, first-user seeding, and Turnstile-gated invite acceptance to tessera OIDC sign-in and local bland sessions.

This guide is primarily for self-hosted forks or clones. The upstream deployment has already completed this migration.

The implementation and variable names say `tessera` because upstream uses tessera as its OIDC provider. Another OIDC provider can work if it supports standard discovery, authorization code + PKCE, confidential clients, signed ID tokens, a stable opaque `sub`, and verified email claims.

## Prerequisites

1. **Back up production state.** Record a D1 Time Travel recovery timestamp or export production D1 before applying the closure migration that drops `users.password_hash`.

2. **OIDC client is registered.** Register bland as an OIDC relying party with your provider.
   - Production redirect URI: `https://<your-bland-host>/api/v1/oidc/callback`
   - Add one redirect URI for each app origin in `ALLOWED_ORIGINS`, such as `https://docs.limic.dev/api/v1/oidc/callback` if you serve bland there.
   - Local dev redirect URI: `http://127.0.0.1:<port>/api/v1/oidc/callback` or the Vite URL printed by `npm run dev`
   - Scopes: `openid email profile`
   - Flow: authorization code with PKCE S256

3. **Provider claims are suitable.**
   - `sub` must be stable and opaque. bland stores it in `tessera_identities.sub`.
   - `email` must be present and verified. bland uses verified email only for first-time legacy binding and profile projection.
   - `name` is optional. New users fall back to a name derived from the email local part.

4. **Cloudflare bindings exist.** The OIDC-era application uses:
   - D1 binding `DB`
   - Durable Object bindings `DocSync` and `WorkspaceIndexer`
   - R2 bindings `R2` and `SITES`
   - Queue binding `SEARCH_QUEUE`
   - Workers AI binding `AI`
   - Rate-limit bindings `RL_AUTH`, `RL_API`, and `RL_AI`

## 1. Upgrade Path By Starting Version

| Upgrading from                | Required steps                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before `d55c6c6`              | Deploy `d55c6c6` first. Configure OIDC, apply migration `0004`, validate sign-in and legacy email binding while `users.password_hash` still exists, then continue to the closure. |
| `d55c6c6` to before `b499aa4` | Finish OIDC validation, confirm at least one owner/admin can sign in through tessera, then deploy `b499aa4` or newer to drop the legacy password column.                          |
| `b499aa4` or newer            | You are on the post-password schema. Make sure OIDC vars/secrets are configured and `tessera_identities` exists.                                                                  |
| Fresh deployment              | Deploy latest directly. Configure OIDC, sign in through tessera, and let bland create the first user, workspace, and owner membership from the verified tessera identity.         |

**Do not apply `0005_famous_juggernaut.sql` until OIDC sign-in is validated.** That migration drops `users.password_hash`. After it runs, rollback to password-era code is not a normal operational path.

## 2. Configure OIDC Runtime Values

Set production secrets:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put TESSERA_OIDC_CLIENT_ID
npx wrangler secret put TESSERA_OIDC_CLIENT_SECRET
```

Set the issuer in `wrangler.jsonc` vars, or as a secret if you prefer:

```bash
TESSERA_OIDC_ISSUER=https://auth.limic.dev
```

For local development, copy `.dev.vars.example` to `.dev.vars` and point `TESSERA_OIDC_ISSUER`, `TESSERA_OIDC_CLIENT_ID`, and `TESSERA_OIDC_CLIENT_SECRET` at a local or development provider. Loopback `http://localhost` and `http://127.0.0.1` issuers are allowed only for local development.

After the OIDC cutover, these legacy values are no longer read and can be removed from the deployed environment after validation:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET`

## 3. Phase 1 Deploy: OIDC Compatibility (`d55c6c6`)

Phase 1 adds tessera OIDC sign-in, `tessera_identities`, authenticated invite acceptance, post-OIDC session bootstrap, and the legacy email binding path. It removes password login, Turnstile, and the initial-user seed script, but keeps `users.password_hash` in D1 so rollback to password-era code still has the column it expects.

### Procedure

1. Check out and deploy the compatibility commit:

   ```bash
   git checkout d55c6c6
   npm ci --ignore-scripts
   npm run db:migrate:remote
   npm run build
   npx wrangler deploy
   ```

2. Open `/login` and start tessera sign-in.

3. For an existing password-era user, sign in with a tessera account whose verified email matches `users.email`. The callback binds that stable OIDC `sub` to the existing user by inserting a row in `tessera_identities`.

4. For a new user, sign in with a verified tessera account that does not match an existing email. bland creates the user, default workspace, and owner membership.

5. Validate the application before applying the closure migration.

### Phase 1 Validation

- [ ] `/login` shows a tessera sign-in action, not a password form
- [ ] `/api/v1/oidc/start` redirects to the configured provider
- [ ] `/api/v1/oidc/callback` returns to the app with an `oidc=1` marker, then the SPA removes the marker after refresh
- [ ] A returning legacy user gets a `tessera_identities` row for their existing `users.id`
- [ ] Existing workspace memberships, shares, pages, uploads, and DocSync content remain attached to the same `users.id`
- [ ] A first-time tessera user creates a new user, workspace, and owner membership
- [ ] Invite preview remains public, while invite acceptance requires tessera auth
- [ ] Email-pinned invites compare against the verified tessera email
- [ ] Existing document editing and DocSync WebSocket connections still work
- [ ] Worker logs show `oidc_callback_success` and no repeated `discovery_failed` or `oidc_token_exchange_failed`

Useful D1 checks:

```bash
npx wrangler d1 execute bland-prod --remote --command \
  "SELECT users.email, tessera_identities.sub FROM users LEFT JOIN tessera_identities ON users.id = tessera_identities.user_id ORDER BY users.email"

npx wrangler d1 execute bland-prod --remote --command \
  "PRAGMA table_info(users)"
```

During phase 1, `PRAGMA table_info(users)` should still show `password_hash`.

### Phase 1 Recovery

If OIDC discovery fails:

- Confirm `TESSERA_OIDC_ISSUER` points at the issuer root that serves `/.well-known/openid-configuration`.
- Confirm non-loopback issuers use HTTPS.
- Confirm `authorization_endpoint`, `token_endpoint`, and `jwks_uri` are on the same host as the issuer.

If callback fails:

- Confirm the exact callback origin is registered with the provider.
- Confirm `TESSERA_OIDC_CLIENT_ID` and `TESSERA_OIDC_CLIENT_SECRET` match the provider registration.
- Confirm the provider returns a signed ID token with `sub`, `email`, and `email_verified: true`.

If a legacy user does not bind:

- Confirm the tessera verified email exactly matches `users.email` after lowercasing.
- If the email belongs to a different already-bound user, the callback fails closed with `tessera_email_conflict` or `identity_conflict`.
- Do not manually reuse a `sub` across multiple users; one tessera `sub` maps to exactly one bland `users.id`.

## 4. Phase 2 Closure: Drop Password Column (`b499aa4` Or Newer)

Phase 2 removes the legacy password column and sentinel code. After this point, bland is OIDC-only for human sign-in.

### Procedure

1. Confirm the phase 1 validation checklist has passed.

2. Deploy the closure commit or latest `main`:

   ```bash
   git checkout b499aa4
   npm ci --ignore-scripts
   npm run db:migrate:remote
   npm run build
   npx wrangler deploy
   ```

   To deploy current `main` after validating the closure boundary:

   ```bash
   git checkout main
   npm ci --ignore-scripts
   npm run deploy
   ```

3. Verify migration `0005_famous_juggernaut.sql` has run:

   ```bash
   npx wrangler d1 execute bland-prod --remote --command "PRAGMA table_info(users)"
   ```

   `password_hash` should no longer be present.

### Post-Closure Validation

- [ ] Existing tessera-bound users can sign in
- [ ] Existing legacy users without a `tessera_identities` row can still bind by verified email on first OIDC sign-in
- [ ] New tessera users can still be created
- [ ] Password login routes are absent
- [ ] Turnstile client and Worker middleware are absent
- [ ] `scripts/seed-initial-user.ts` and seed npm scripts are absent
- [ ] `users.password_hash` is absent from D1
- [ ] `tessera_identities.sub` is primary key and `tessera_identities.user_id` is unique
- [ ] Invite acceptance works only after tessera auth
- [ ] Auth refresh still propagates the D1 bookmark after OIDC callback

## 5. Operational Notes

### OIDC Provider Compatibility

The code uses `openid-client` v6. The provider contract is:

- Issuer exposes OIDC discovery at `/.well-known/openid-configuration`
- Authorization endpoint supports authorization code + PKCE S256
- Token endpoint returns a signed ID token
- ID token validates for the configured client id audience
- ID token includes stable `sub`
- ID token includes verified `email`

bland never uses tessera ID tokens as application sessions. The callback validates the ID token once, binds the identity, then mints local bland JWT sessions.

### Session And Invite Behavior After Migration

- Refresh tokens live in the `bland_refresh` HttpOnly cookie.
- Access tokens live only in client memory and are sent as bearer headers for HTTP API calls and DocSync connection params.
- The OIDC transaction cookie is `__Host-bland_oidc_tx`, HttpOnly, Secure, SameSite=Lax, and short-lived.
- The callback redirects to the sanitized `return_to` path with `oidc=1`; the SPA performs a blocking refresh and then removes the marker.
- Invite preview stays public. Invite acceptance is strictly auth-required.
- Shared `/s/:token` surfaces remain token-scoped and do not become member surfaces just because the viewer also has a session.

### Rollback Posture

Before migration `0005`, rollback to password-era code is possible if the old Turnstile and password-login runtime configuration is still available. After `0005`, rollback to password-era code requires a deliberate D1 restore or manual schema/data restoration. Treat post-closure failures as forward-fix unless you have an external restore plan.

## 6. Useful Commands

```bash
# Apply D1 migrations to production
npm run db:migrate:remote

# Apply D1 migrations locally
npm run db:migrate:local

# Generate Worker binding types from local env placeholders
npm run types:generate

# Typecheck and lint
npm run typecheck
npm run lint
```

Targeted validation:

```bash
npx vitest run --project worker-unit tests/worker/lib/oidc.test.ts
npx vitest run --project worker-runtime \
  tests/worker/db/tessera-identities.workers.test.ts \
  tests/worker/routes/oidc.workers.test.ts \
  tests/worker/routes/invite-accept.workers.test.ts
npx vitest run --project client tests/client/lib/session-bootstrap.test.ts
npx vitest run --project client-dom \
  tests/client/lib/session-bootstrap.dom.test.ts \
  tests/client/lib/api.dom.test.ts
npx playwright test -c tests/e2e/playwright.config.ts \
  tests/e2e/specs/28-oidc-first-login.spec.ts \
  tests/e2e/specs/29-oidc-returning.spec.ts
```

## Appendix: What The OIDC Cutover Removed

- Password login route and client password form
- Cloudflare Turnstile invite/login integration
- First-user seed script and seed npm scripts
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` runtime dependency
- `users.password_hash` in the closure migration
- Password-hash dependencies used only by the seed/login path

The post-closure auth model is: tessera owns human identity and verified email; bland owns local JWT sessions, workspace memberships, roles, invites, shares, uploads, Sites authorization, and product permissions.
