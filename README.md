# 📝 bland

**Collaborative block-based notes with live cursors, running entirely on Cloudflare's edge.** Nested pages, canvas pages, real-time multiplayer editing, publishing, and full-text search — no VMs, no sync servers, just Workers, Durable Objects, D1, R2, and Queues.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zllovesuki/bland)

Built with [GPT-5.4](https://openai.com/index/introducing-gpt-5-4/) and [Claude Opus 4.6](https://www.anthropic.com/claude/opus) agentic workflows. 🤖✨

> **OIDC Upgrade Notice:** Password login, initial-user seeding, and Turnstile invite acceptance were replaced by tessera OIDC. If upgrading an existing deployment from before the OIDC cutover, follow [MIGRATION-OIDC.md](MIGRATION-OIDC.md) before deploying latest `main`.

---

## 🎯 What is bland?

bland is a tessera-backed workspace for writing and organizing notes together in real time. Pages nest up to 10 levels deep, live cursors and presence show who's editing where, and a custom Tiptap/ProseMirror editor handles rich blocks such as headings, lists, tables, code blocks, details blocks, images, and page mentions.

The whole thing runs on Cloudflare: Workers serve the API, Durable Objects hold per-document Yjs state and per-workspace FTS indexes, D1 owns relational metadata, R2 stores uploads and derived Sites artifacts, and Queues drive search indexing.

Human identity comes from tessera OIDC. bland owns local sessions, workspace memberships, roles, invites, shares, and product authorization.

---

## ✨ Features

- **Nested page tree** — up to 10 levels deep, with drag-drop reordering and breadcrumb navigation
- **Rich block editor** — paragraphs, headings, lists, to-dos, tables, code blocks with syntax highlighting, collapsible details, images, dividers, emoji, and page mentions
- **Canvas pages** — Excalidraw-backed full-page canvases that share the same DocSync session path
- **Real-time multiplayer** — live cursors, presence, and collaborative edits over WebSocket via Yjs + y-partyserver
- **Offline-first documents** — y-indexeddb caches each visited page locally; edits sync on reconnect
- **Page mentions** — reference other pages inline with live-updating titles
- **Workspaces with roles** — owner, admin, member, and guest, each with scoped permissions
- **tessera sign-in** — OIDC authorization code + PKCE with local JWT sessions and refresh cookies
- **Workspace invites** — time-bounded invite links, optionally pinned to a tessera-owned email
- **Page sharing** — share a page directly with users or via a secret `/s/:token` link, with `view` or `edit` permissions
- **Public Sites** — publish selected document pages to a workspace site on the configured Sites domain
- **Full-text search** — per-workspace FTS5 index driven by a queue consumer, rebuildable from document state
- **File & image uploads** — R2 uploads with authenticated proxying
- **Page covers + emoji icons** — per-page visual identity
- **"Shared with me" inbox** — one place to find every external page shared with you
- **AI writing assist** — selection rewrite, slash-menu generation, page summary, and ask-this-page chat, streamed from Cloudflare Workers AI

---

## 🏗️ How it works

```text
React SPA (TanStack Router + Zustand + Yjs + y-indexeddb)
  | HTTPS                                  | WebSocket via PartyServer
  v                                        v
+-----------------------------+----RPC: getIndexPayload----> +------------------------+
| Worker                      |                               | DocSync DO             |
| Hono API + queue consumer   |                               | one per page           |
| auth, CRUD, shares, search, |                               | Yjs state + SQLite     |
| uploads, Sites, SPA shell   |                               | snapshots              |
+---+-------+------+----------+                               +------------------------+
    |       |      |  \
    |       |      |   \ RPC: search, indexPage, removePage, clear
    |       |      |    \
    |       |      |     v
    |       |      |  +------------------------+
    |       |      |  | WorkspaceIndexer DO    |
    |       |      |  | FTS5 per workspace     |
    |       |      |  +------------------------+
    |       |      |
    |       |      +--> +--------+
    |       |           | Queues |
    |       |           +--------+
    |       |
    |       +--> +----+
    |       |    | D1 |
    |       |    +----+
    |       |
    |       +--> +------------------+
    |            | R2 uploads/Sites |
    |            +------------------+
    |
    +--> Cache API for public Sites HTML
```

D1 is the single source of truth for relational metadata. Document and canvas content lives in per-page `DocSync` DO-local SQLite. Search data lives in per-workspace `WorkspaceIndexer` DO-local SQLite (FTS5). Public Sites artifacts live in the `SITES` R2 bucket, with public HTML rendered by the Worker and cached in Cache API. The Worker handles HTTP plus queue consumption, and it orchestrates search indexing by reading indexable text from `DocSync.getIndexPayload()` and writing derived FTS entries into `WorkspaceIndexer` — no DO-to-DO calls.

---

## 🧰 Tech stack

|     | Layer         | Technology                                                                 |
| --- | ------------- | -------------------------------------------------------------------------- |
| 🖥️  | Frontend      | React 19, TanStack Router, TanStack Query, Tailwind CSS 4, Vite 8, Zustand |
| ✍️  | Editor        | Tiptap 3 / ProseMirror with a custom extension set                         |
| 🎨  | Canvas        | Excalidraw + Yjs                                                           |
| 🔄  | Collaboration | Yjs, y-partyserver, y-indexeddb, y-protocols                               |
| ⚙️  | API runtime   | Cloudflare Workers + Hono 4.12                                             |
| 💾  | Storage       | D1 (Drizzle ORM), Durable Objects with SQLite, R2, Cache API               |
| 📨  | Async work    | Cloudflare Queues — derived search indexing                                |
| 🔐  | Auth          | tessera OIDC identity with local JWT sessions via `jose`                   |
| 🔍  | Search        | SQLite FTS5 inside per-workspace Durable Objects                           |
| 🧠  | AI            | Cloudflare Workers AI (default Gemma 4 26B), streaming SSE                 |
| 🚦  | Rate limiting | Native Cloudflare rate-limit bindings (`RL_AUTH`, `RL_API`, `RL_AI`)       |
| ✅  | Validation    | Zod, strict TypeScript end-to-end                                          |

---

## ⚡ Quick start

```bash
npm ci --ignore-scripts
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Configure `.dev.vars` with a local or development tessera issuer before signing in. `npm run dev` runs the emoji data generator first, then starts Vite with the Cloudflare integration. On first verified tessera sign-in, bland creates the user, default workspace, and owner membership from the stable tessera `sub`.

---

## 📜 Common scripts

| Command                    | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run dev`              | Start the local Vite dev server with Cloudflare Vite integration |
| `npm run build`            | Production app, Worker, service worker, and Sites asset builds   |
| `npm run typecheck`        | Full TypeScript check (app + tests)                              |
| `npm run lint`             | ESLint over source, tests, scripts, and Vite config              |
| `npm test`                 | Vitest unit tests                                                |
| `npm run test:e2e`         | Playwright browser tests                                         |
| `npm run db:generate`      | Regenerate Drizzle migrations for D1 and both DOs                |
| `npm run db:migrate:local` | Apply D1 migrations against the local dev database               |
| `npm run deploy`           | Remote D1 migrate, production build, `wrangler deploy`           |
| `npm run format`           | Prettier formatting                                              |

---

## 📁 Project structure

```
src/
  client/           🖥️  React SPA (components, editor, canvas, stores, routes)
    sites/               Browser islands for published Sites
  worker/           ⚙️  Cloudflare Worker
    routes/              Hono HTTP handlers (auth, OIDC, pages, shares, uploads, Sites, ...)
    durable-objects/     DocSync (per-page) and WorkspaceIndexer (per-workspace)
    queues/              Search indexer consumer
    middleware/          Auth and rate limiting
    db/                  Drizzle schemas — D1 + both DO-local SQLite schemas
    lib/                 Reusable worker helpers (auth, origins, page access)
    sites/               Public Sites dispatch, rendering, caching, and asset gates
  shared/           📝  Client/worker contracts (types, doc messages)
    sites/               Published Sites schemas and entrypoint metadata
  sites/            🌐  Worker-safe static renderer for published Sites
  lib/              🔧  Shared utilities used across client and worker
drizzle/            📦  Generated migrations for D1, DocSync, WorkspaceIndexer
docs/               📖  ADRs, specs, and design notes
tests/              ⚡  Vitest unit tests + Playwright e2e
scripts/            🛠️  Repo utility scripts (emoji data generation, icon generation)
```

---

## 🚢 Deploying

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` applies remote D1 migrations first, then builds and deploys the Worker.

First time deploying to a fresh Cloudflare account? See [OPERATOR.md](OPERATOR.md) for the full first-time setup (creating bindings, setting secrets, registering tessera redirect URIs, attaching custom domains, and bootstrapping the first tessera user) and the runbook for incidents and rollback.

Upgrading a password-era deployment? Read [MIGRATION-OIDC.md](MIGRATION-OIDC.md) before deploying latest `main`.

---

## 🤝 Contributing

The codebase is strict TypeScript throughout, with a clear `client` / `worker` / `shared` / `lib` split. Before you dive in:

- [AGENTS.md](AGENTS.md) — change guidelines, naming rules, invariants, and existing helpers to reuse
- [docs/bland-production-spec.md](docs/bland-production-spec.md) — historical product and architecture reference
- [OPERATOR.md](OPERATOR.md) — deployment, observability, and incident runbooks

```bash
npm run typecheck
npm test
```

---

## 📄 License

[MIT](LICENSE) — Rachel Chen, 2026
