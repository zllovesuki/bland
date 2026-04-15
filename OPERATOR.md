# OPERATOR.md

This document is the operator runbook for `bland` v1 as it exists in the live repo today.

When this file conflicts with older docs, the source tree wins.

## Purpose

- Deploy the production Worker safely.
- Verify the core user flows after deploy.
- Triage incidents against the current Cloudflare topology.
- Be explicit about current operational gaps instead of inventing recovery paths that do not exist in the repo.

## Production Topology

Current production runtime from `wrangler.jsonc`:

| Component       | Current value                 |
| --------------- | ----------------------------- |
| Worker name     | `bland`                       |
| Domain          | `https://bland.tools`         |
| D1              | `bland-prod`                  |
| R2              | `bland-uploads`               |
| Queue           | `bland-tasks`                 |
| Durable Objects | `DocSync`, `WorkspaceIndexer` |
| Rate limits     | `RL_AUTH`, `RL_API`           |
| Assets binding  | `ASSETS`                      |

Request routing in the live Worker:

- `GET /api/v1/*` and `/uploads/*` go through the Hono app.
- `/parties/*` goes through PartyServer / `DocSync`.
- Document navigations are Worker-first SPA shell responses from `ASSETS`.
- Direct asset requests are served from `ASSETS`.

## Data Authority

- D1 is authoritative for users, workspaces, memberships, page metadata, invites, shares, and upload metadata.
- `DocSync` DO-local SQLite is authoritative for persisted Yjs document snapshots.
- `WorkspaceIndexer` DO-local SQLite is authoritative for the derived FTS index.
- R2 stores upload blobs only. It is not an authorization store.
- The search queue carries derived `index-page` work only. Lost queue messages can stale search, but they do not lose source-of-truth data.
- D1 read-after-write across requests depends on bookmark propagation via `x-bland-d1-bookmark`.

## Required Runtime Config

Production requires these runtime values:

- `LOG_LEVEL`
- `ALLOWED_ORIGINS`
- `JWT_SECRET`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET`
- `SENTRY_DSN`

Notes:

- `JWT_SECRET` and `TURNSTILE_SECRET` are secrets.
- `TURNSTILE_SITE_KEY` is public config, but still required at runtime because the Worker injects it into the SPA shell.
- `SENTRY_DSN` is used for client-side Sentry only. Worker-side Sentry is not implemented.
- `ALLOWED_ORIGINS` controls both HTTP CORS and WebSocket origin checks. Keep it exact.

## Deploy Runbook

There is no separate staging Wrangler environment configured in the live repo today. The default config is the production target.

### Preflight

Run these from repo root before deployment:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

### Standard production deploy

```bash
npm run deploy
```

Current behavior:

- `npm run deploy` runs `npm run db:migrate:remote`
- then `npm run build`
- then `wrangler deploy`

### Manual split deploy

Use this if you want the migration and deploy steps separated:

```bash
npm run db:migrate:remote
npm run build
npx wrangler deploy
```

### Local-only migration

For local development only:

```bash
npm run db:migrate:local
```

Do not use `db:migrate:local` as part of production deployment.

## Post-Deploy Smoke Checks

Run these checks immediately after production deploy:

1. `GET https://bland.tools/api/v1/health`
2. Load `https://bland.tools/login` and confirm Turnstile renders.
3. Log in with a real account and confirm session refresh works after reload.
4. Open a page, edit content, reload, and confirm content persists.
5. Open the same page in a second client and confirm collaboration still connects.
6. Create or open a share link and verify the expected view/edit behavior.
7. Upload an allowed file and confirm the resulting `/uploads/:id` URL serves correctly for an authorized viewer.
8. Edit page text, wait for queue-driven indexing, and verify the page appears in workspace search.

Important:

- `/api/v1/health` is only a liveness check. It currently returns `status` and `timestamp` only.
- A passing health check does not prove D1, R2, Queue, or Durable Object correctness.

## Observability

### Primary tools

- Worker logs:

```bash
npx wrangler tail bland --format pretty
```

- Deployment status:

```bash
npx wrangler deployments status
npx wrangler deployments list
```

- Queue metadata:

```bash
npx wrangler queues info bland-tasks
```

### Backend signals to watch first

High-signal Worker and DO events in the live source tree:

- `unhandled_error`
- `message_failed`
- `queue_send_failed`
- `snapshot_save_failed`
- `title_sync_failed`
- `index_page_failed`
- `search_failed`
- `workspace_indexer_clear_failed`
- `rate_limit_exceeded`
- `origin_rejected`
- `auth_failed`
- `access_denied`
- `share_access_denied`

### Client-side signals

Client-side Sentry is enabled through SPA shell bootstrap when `SENTRY_DSN` is set.

High-signal client capture sources:

- `client-config.bootstrap`
- `window.error`
- `window.unhandledrejection`
- `react.root-uncaught`
- `page.load`
- `shared-page.resolve`
- `shared-page.active-page-load`
- `turnstile.missing-api`
- `turnstile.render-failed`
- `turnstile.script-load-failed`

## Incident Runbooks

### Roll back the Worker deployment

List recent deployments:

```bash
npx wrangler deployments list
```

Rollback:

```bash
npx wrangler rollback <version-id> --name bland --message "rollback reason"
```

This rolls back Worker code, not D1 data, DO-local SQLite state, or R2 objects.

### Restore D1 metadata with Time Travel

Inspect the recovery point:

```bash
npx wrangler d1 time-travel info bland-prod
```

Restore to a timestamp:

```bash
npx wrangler d1 time-travel restore bland-prod --timestamp <RFC3339 timestamp>
```

Notes:

- This acts on the remote D1 database.
- D1 restore only covers relational metadata stored in D1.
- It does not restore `DocSync` document snapshots or `WorkspaceIndexer` FTS data, because those live in Durable Object local SQLite.

### Search is stale or missing results

Current state:

- Search is a derived projection owned by `WorkspaceIndexer`.
- There is no bulk rebuild script checked into this repo today.
- There is no DLQ configured for `bland-tasks`.

What you can do now:

- Inspect queue metadata with `npx wrangler queues info bland-tasks`.
- Tail logs and look for `message_failed`, `fts_indexed`, `fts_removed`, `index_page_failed`, and `search_failed`.
- Re-save an affected page to enqueue a fresh `index-page` message.
- Archive and restore an affected page to force removal/re-index behavior if appropriate.

What you cannot do today:

- Run a repo-supported full workspace search rebuild.

### Document content incident

Current state:

- Persisted document content lives in `DocSync` DO-local SQLite, not in D1.
- There is no repo-local bulk export, bulk restore, or replay script for DocSync state.

Operational guidance:

- Treat this as a Durable Object storage incident, not a D1 incident.
- Use Cloudflare Durable Object SQLite recovery tooling/support outside this repo as applicable.
- Do not assume a D1 restore repairs document content.

### Upload or R2 incident

Current state:

- R2 has no time-travel restore path in this repo.
- Missing R2 objects are gone unless recovered outside normal repo tooling.
- The D1 `uploads` row can remain as an audit trail even if the blob is missing.

Useful object commands:

```bash
npx wrangler r2 object get <bucket>/<key>
npx wrangler r2 object delete <bucket>/<key>
```

### Queue delivery incident

Current state:

- Queue failures only affect derived search indexing.
- Source-of-truth user/workspace/page metadata and document snapshots are stored elsewhere.

Useful commands:

```bash
npx wrangler queues info bland-tasks
npx wrangler queues pause-delivery bland-tasks
npx wrangler queues resume-delivery bland-tasks
```

Be cautious with `purge`; it drops pending derived work.

## Known Gaps

These are current operational limitations, not bugs in this document:

- No worker-side Sentry integration.
- No staging Wrangler environment in the repo.
- `/api/v1/health` does not verify D1, R2, Queue, or DO dependencies.
- No DLQ configured for `bland-tasks`.
- No repo-supported bulk search rebuild script.
- No repo-supported bulk restore/export path for `DocSync` DO-local document storage.
- Workspace deletion clears D1 rows and `WorkspaceIndexer`, but does not synchronously delete R2 objects or DocSync DO storage.
- Uploads are Worker-proxied through `PUT /uploads/:id/data`, not direct presigned browser-to-R2 uploads.
- PWA installability/offline shell work is separate from v1 operator responsibilities.
- AI operations are out of scope for v1.
