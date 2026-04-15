# 📝 bland

**Collaborative block-based notes with live cursors, running entirely on Cloudflare's edge.** Nested pages, real-time multiplayer editing, and full-text search — no VMs, no sync servers, just Workers, Durable Objects, D1, R2, and Queues.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zllovesuki/bland)

Built with [GPT-5.4](https://openai.com/index/introducing-gpt-5-4/) and [Claude Opus 4.6](https://www.anthropic.com/claude/opus) agentic workflows. 🤖✨

---

## 🎯 What is bland?

bland is an invite-only workspace for writing and organizing notes together in real time. Pages nest up to 10 levels deep, live cursors and presence show who's editing where, and a custom Tiptap/ProseMirror editor handles rich blocks such as headings, lists, tables, code blocks, details blocks, images, and page mentions.

The whole thing runs on Cloudflare: Workers serve the API, Durable Objects hold per-document Yjs state and per-workspace FTS indexes, D1 owns relational metadata, R2 stores uploaded blobs, and Queues drive derived search indexing.

No open sign-up — access happens through workspace invites.

---

## ✨ Features

- **Nested page tree** — up to 10 levels deep, with drag-drop reordering and breadcrumb navigation
- **Rich block editor** — paragraphs, headings, lists, to-dos, tables, code blocks with syntax highlighting, collapsible details, images, dividers, emoji, and page mentions
- **Real-time multiplayer** — live cursors, presence, and collaborative edits over WebSocket via Yjs + y-partyserver
- **Offline-first documents** — y-indexeddb caches each visited page locally; edits sync on reconnect
- **Page mentions** — reference other pages inline with live-updating titles
- **Workspaces with roles** — owner, admin, member, and guest, each with scoped permissions
- **Invite-only signup** — time-bounded invite links gated by Cloudflare Turnstile
- **Page sharing** — share a page directly with users or via a secret `/s/:token` link, with `view` or `edit` permissions
- **Full-text search** — per-workspace FTS5 index driven by a queue consumer, rebuildable from document state
- **File & image uploads** — R2 uploads with authenticated proxying
- **Page covers + emoji icons** — per-page visual identity
- **"Shared with me" inbox** — one place to find every external page shared with you

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
| uploads, SPA shell          |                               | snapshots              |
+---+-----------+-------------+                               +------------------------+
    |           |      \
    |           |       \ RPC: search, indexPage, removePage, clear
    |           |        \
    |           |         v
    |           |   +------------------------+
    |           |   | WorkspaceIndexer DO    |
    |           |   | FTS5 per workspace     |
    |           |   +------------------------+
    |           |
    |           +--> +--------+
    |                | Queues |
    |                +--------+
    |
    +--> +----+
    |    | D1 |
    |    +----+
    |
    +--> +----+
         | R2 |
         +----+
```

D1 is the single source of truth for relational metadata. Document content lives in per-page `DocSync` DO-local SQLite. Search data lives in per-workspace `WorkspaceIndexer` DO-local SQLite (FTS5). The Worker handles HTTP plus queue consumption, and it orchestrates search indexing by reading indexable text from `DocSync.getIndexPayload()` and writing derived FTS entries into `WorkspaceIndexer` — no DO-to-DO calls.

---

## 🧰 Tech stack

|     | Layer         | Technology                                                      |
| --- | ------------- | --------------------------------------------------------------- |
| 🖥️  | Frontend      | React 19, TanStack Router, Tailwind CSS 4, Vite 8, Zustand      |
| ✍️  | Editor        | Tiptap 3 / ProseMirror with a custom extension set              |
| 🔄  | Collaboration | Yjs, y-partyserver, y-indexeddb, y-protocols                    |
| ⚙️  | API runtime   | Cloudflare Workers + Hono 4.7                                   |
| 💾  | Storage       | D1 (Drizzle ORM), Durable Objects with SQLite, R2               |
| 📨  | Async work    | Cloudflare Queues — derived search indexing                     |
| 🔐  | Auth          | JWT (HS256) via `jose`, Argon2id passwords, Turnstile on signup |
| 🔍  | Search        | SQLite FTS5 inside per-workspace Durable Objects                |
| 🚦  | Rate limiting | Native Cloudflare rate-limit bindings (`RL_AUTH`, `RL_API`)     |
| ✅  | Validation    | Zod, strict TypeScript end-to-end                               |

---

## ⚡ Quick start

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed-initial-user -- --email you@example.com --name "Your Name"
npm run dev
```

The seed script prompts for a password (or pass `--password <pw>`). Log in at the URL the dev server prints, and you land in a freshly created workspace.

Local development uses the Cloudflare Turnstile test keys baked into `.dev.vars.example`, so signup works out of the box.

---

## 📜 Common scripts

| Command                        | What it does                                                     |
| ------------------------------ | ---------------------------------------------------------------- |
| `npm run dev`                  | Start the local Vite dev server with Cloudflare Vite integration |
| `npm run build`                | Production build (Vite + Worker)                                 |
| `npm run typecheck`            | Full TypeScript check (app + tests)                              |
| `npm test`                     | Vitest unit tests                                                |
| `npm run test:e2e`             | Playwright browser tests                                         |
| `npm run db:generate`          | Regenerate Drizzle migrations for D1 and both DOs                |
| `npm run db:migrate:local`     | Apply D1 migrations against the local dev database               |
| `npm run db:seed-initial-user` | Seed the bootstrap user, workspace, and ownership                |
| `npm run deploy`               | Remote D1 migrate, production build, `wrangler deploy`           |
| `npm run format`               | Prettier formatting                                              |

---

## 📁 Project structure

```
src/
  client/           🖥️  React SPA (components, editor, stores, routes)
  worker/           ⚙️  Cloudflare Worker
    routes/              Hono HTTP handlers (auth, pages, shares, uploads, ...)
    durable-objects/     DocSync (per-page) and WorkspaceIndexer (per-workspace)
    queues/              Search indexer consumer
    middleware/          Auth, rate limiting, Turnstile verification
    db/                  Drizzle schemas — D1 + both DO-local SQLite schemas
    lib/                 Reusable worker helpers (auth, origins, page access)
  shared/           📝  Client/worker contracts (types, doc messages)
  lib/              🔧  Shared utilities used across client and worker
drizzle/            📦  Generated migrations for D1, DocSync, WorkspaceIndexer
docs/               📖  Production spec and design notes
tests/              ⚡  Vitest unit tests + Playwright e2e
scripts/            🛠️  Repo utility scripts (emoji data generation, bootstrap user seed)
```

---

## 🚢 Deploying

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` applies remote D1 migrations first, then builds and deploys the Worker.

First time deploying to a fresh Cloudflare account? See [OPERATOR.md](OPERATOR.md) for the full first-time setup (creating bindings, setting secrets, attaching the custom domain, seeding the bootstrap user) and the runbook for incidents and rollback.

---

## 🤝 Contributing

The codebase is strict TypeScript throughout, with a clear `client` / `worker` / `shared` / `lib` split. Before you dive in:

- [AGENTS.md](AGENTS.md) — change guidelines, naming rules, invariants, and existing helpers to reuse
- [docs/bland-production-spec.md](docs/bland-production-spec.md) — product and architecture reference
- [OPERATOR.md](OPERATOR.md) — deployment, observability, and incident runbooks

```bash
npm run typecheck
npm test
```

---

## 📄 License

[MIT](LICENSE) — Rachel Chen, 2026
