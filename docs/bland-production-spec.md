# bland — Production Spec v3

> Mini docs app with live cursors and same-page coauthoring, running on native Cloudflare.
> **Domain:** bland.tools
>
> **Status note (April 8, 2026):** the live project uses a custom Tiptap/ProseMirror editor in `src/client/components/editor/`, not BlockNote. When this spec conflicts with the source tree on editor implementation details, the source tree wins.
>
> **Storage model note (April 9, 2026):** the live project has moved document snapshots and FTS data out of D1 into Durable Object local SQLite. `doc_snapshots` is stored in DocSync DO (chunked), `pages_fts` is stored in a per-workspace WorkspaceIndexer DO. D1 retains all relational metadata. See [docs/d1-vs-do-content-storage.md](./d1-vs-do-content-storage.md) for the rationale and current design. Where this spec references D1-resident snapshots or FTS, the source tree wins.

### Philosophy

> **"Can we do more with less code?"**
>
> Proposed implementation should target minimal code surface without sacrificing correctness, performance, or security (this applies to iterating). If we can relax the requirements, prefer less code over extra guarantees for no material gains (this applies to all changes).

---

## 1. Product Definition

### What bland does

- Block-based page editor (paragraphs, headings, lists, todos, images, embeds, tables, code, callouts, toggles, dividers)
- Infinitely nestable page tree (pages inside pages)
- Real-time multiplayer editing with live cursors and presence
- Workspaces with membership and roles
- Sharing via invite link, secret link, and editable link
- Full-text search across all pages in a workspace
- File and image uploads
- Per-document offline editing with sync-on-reconnect for previously visited pages

### What bland doesn't do (v1)

- Databases, formulas, views (tables-as-databases, kanban, calendar, gallery)
- Comments, mentions, inline discussion
- Version history / page snapshots (D1 Time Travel covers disaster recovery, not user-facing undo)
- Imports / exports
- Public publishing
- Templates marketplace
- AI features
- Offline workspace mutations (create/move/delete pages while offline)
- Full offline-first architecture (workspace metadata is online-first with stale cache)

### What bland never says

bland is not "Notion" and does not reference Notion anywhere publicly. It is its own product.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                           Client                                 │
│  React 19 + BlockNote + Yjs + y-indexeddb + Zustand              │
└──────────┬───────────────────────────┬───────────────────────────┘
           │ HTTPS (REST)              │ WebSocket
           ▼                           ▼
┌──────────────────────┐   ┌───────────────────────────────┐
│  Workers (API)       │   │  Durable Objects (PartyServer) │
│  Hono, auth, CRUD,   │   │  One per document.             │
│  search, presign     │   │  YServer subclass,             │
│                      │   │  Yjs state, cursors,           │
│                      │   │  awareness, persistence        │
└───┬────┬────┬────────┘   └──────────────┬────────────────┘
    │    │    │                            │
    ▼    ▼    ▼                            ▼
  ┌──┐ ┌──────┐ ┌──┐                   ┌─────┐
  │D1│ │Queues│ │R2│                   │ D1  │
  └──┘ └──────┘ └──┘                   └─────┘
```

### Component Responsibilities

| Component                                       | Role                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workers (API)**                               | Hono-based HTTP router. Authentication, authorization, page CRUD, workspace management, search queries, file upload presigning, queue message production                                          |
| **Durable Objects (YServer via y-partyserver)** | One instance per document. Holds Yjs doc in memory, accepts WebSocket connections, broadcasts updates, persists via `onLoad`/`onSave` to D1 (snapshot mode). Hibernation enabled for cost savings |
| **D1**                                          | Single source of truth for all structured data: users, workspaces, memberships, page tree, permissions, Yjs snapshots, search index (FTS5). Global read replication via Sessions API              |
| **Queues**                                      | Async background work: search index updates. Keeps FTS failures from blocking snapshot persistence                                                                                                |
| **R2**                                          | Blob store for image and file uploads. Not the permission model — ownership, MIME, size, and ACLs live in D1                                                                                      |

### What is NOT in v1

**No KV.** D1 with global read replication (Sessions API) handles reads fast enough. KV's eventual consistency makes it a bad fit for ACLs and page metadata, and the added complexity of cache invalidation isn't justified until we measure a real need. JWT revocation uses a short token lifetime (15min) instead of a denylist.

---

## 3. Tech Stack

| Layer             | Choice                                             | Notes                                                                                        |
| ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Runtime           | Cloudflare Workers                                 | via `wrangler` CLI                                                                           |
| HTTP framework    | Hono                                               | Edge-native, lightweight, middleware-friendly (matches anvil's stack)                        |
| Real-time collab  | `partyserver` + `y-partyserver` on Durable Objects | DO class inside Wrangler project. Snapshot persistence mode                                  |
| Structured data   | D1 (SQLite at the edge)                            | Global read replication via Sessions API. Single source of truth                             |
| Async work        | Queues                                             | Search indexing only                                                                         |
| File storage      | R2                                                 | Blob store. Serve originals via Worker. Add Cloudflare Images URL transforms later if needed |
| Frontend          | React 19 + Vite 8                                  | SPA, served by Workers via Assets binding                                                    |
| Editor            | BlockNote                                          | Block-based, built on Tiptap/ProseMirror, Yjs-native                                         |
| CRDT              | Yjs                                                | via `y-partyserver` (network) + `y-indexeddb` (local persistence)                            |
| Styling           | Tailwind CSS v4                                    | CSS-native config, no `tailwind.config.js`                                                   |
| Icons             | lucide-react v0.542+                               |                                                                                              |
| State             | Zustand                                            | Lightweight, works well with Yjs-driven state                                                |
| Routing           | TanStack Router `@tanstack/react-router@^1.168`    | Fully type-safe routes, file-based generation, auto code-splitting                           |
| Offline storage   | y-indexeddb                                        | Per-document offline editing for previously visited pages                                    |
| Auth              | Invite-only, JWT + Turnstile                       | Turnstile pattern from flamemail                                                             |
| Rate limiting     | Rate Limiting Binding                              | Native Workers API, via `@elithrar/workers-hono-rate-limit` middleware                       |
| Search            | D1 FTS5                                            | Upgrade to Vectorize later if needed                                                         |
| Schema validation | `@cloudflare/util-en-garde` or Zod                 | Runtime codec validation at API boundaries (matches anvil's approach)                        |
| ORM               | Drizzle                                            | Type-safe D1 access (matches anvil's stack)                                                  |
| Language          | TypeScript (strict)                                |                                                                                              |
| Source control    | git-on-cloudflare                                  | Cloudflare-native Git server at `git-on-cloudflare.com`                                      |
| CI                | anvil                                              | Cloudflare-native CI at `anvil.devbin.tools`. CD is manual (`npm run deploy`)                |

### Deviations from devbin.tools Frontend Spec

The [devbin.tools](./frontend-spec.md) spec is the baseline. bland deviates in these ways:

1. **State management**: The spec says "no external state libraries." bland uses Zustand because the workspace store (page tree, members, optimistic updates, localStorage persistence) is complex enough to warrant it, and Zustand integrates cleanly with Yjs-driven state.
2. **Layout**: The spec defines a standard `max-w-7xl` content container. bland replaces this with a sidebar + editor split layout between the header and footer. The header and footer remain standard devbin.tools components.
3. **Footer visibility**: Hidden on small screens and when scrolling to maximize editor space.
4. **Header behavior**: Auto-hides on scroll down, reappears on scroll up, to give the editor more room.
5. **Vite version**: Spec says `^7.x`, bland targets Vite 8.

---

## 4. Data Truth and Persistence

Every piece of data has exactly one authoritative home. This table is the contract.

| Data                                              | Authoritative store                                                          | Persistence                  | Rebuildable from                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| User accounts, memberships, roles                 | D1 `users`, `memberships`                                                    | Durable                      | —                                                            |
| Workspace config (name, slug, icon)               | D1 `workspaces`                                                              | Durable                      | —                                                            |
| Page tree (parent/child, position, icon, cover)   | D1 `pages`                                                                   | Durable                      | —                                                            |
| Page title                                        | Y.Doc `page-title` (authoritative) → synced to D1 `pages.title` via `onSave` | Durable                      | D1 is the read cache for sidebar/search; Y.Doc is the source |
| Page shares and permissions                       | D1 `page_shares`                                                             | Durable                      | —                                                            |
| Invites                                           | D1 `invites`                                                                 | Durable                      | —                                                            |
| Upload metadata (filename, MIME, size, page link) | D1 `uploads`                                                                 | Durable                      | —                                                            |
| Document content (blocks, text, structure)        | Yjs Y.Doc in Durable Object memory                                           | Ephemeral while DO is active | D1 `doc_snapshots` (snapshot)                                |
| Document content (persisted)                      | D1 `doc_snapshots` (full Yjs state vector)                                   | Durable                      | —                                                            |
| Full-text search index                            | D1 `pages_fts` (FTS5)                                                        | Durable                      | Rebuildable from `doc_snapshots`                             |
| File/image blobs                                  | R2                                                                           | Durable                      | —                                                            |
| Cursor positions, presence, user colors           | Yjs awareness protocol (in-memory)                                           | Ephemeral                    | Not persisted — regenerated on connect                       |
| Client-side document cache                        | y-indexeddb (browser IndexedDB)                                              | Local, per-device            | Rebuildable from DO via Yjs sync                             |
| Client-side workspace cache                       | Zustand + localStorage                                                       | Local, per-device            | Rebuildable from D1 via REST API                             |

### Key invariants

- D1 is the single source of truth for everything except live document content (which is the Y.Doc in the DO).
- Presence/awareness is strictly ephemeral — never stored in D1, R2, or the Yjs document.
- The FTS index is a derived projection. If corrupted, it can be rebuilt by iterating `doc_snapshots` and re-extracting plaintext.
- R2 stores blobs only. All access control decisions are made against D1.
- No KV in v1. If we later need a cache, it sits in front of D1, never as a source of truth.

---

## 5. Data Model (D1 Schema)

### 5.1 Users & Auth

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,       -- ulid
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- Argon2id
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE invites (
  id            TEXT PRIMARY KEY,       -- ulid
  email         TEXT,                   -- optional: can be a generic link
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  invited_by    TEXT NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member', 'guest')) DEFAULT 'member',
  token         TEXT UNIQUE NOT NULL,   -- invite link token
  accepted_at   TEXT,
  accepted_by   TEXT REFERENCES users(id),
  revoked_at    TEXT,                   -- manual revocation
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_email ON invites(email);
```

### 5.2 Workspaces & Membership

```sql
CREATE TABLE workspaces (
  id            TEXT PRIMARY KEY,       -- ulid
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,   -- URL-safe, unique across all workspaces
  icon          TEXT,
  owner_id      TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE memberships (
  user_id       TEXT NOT NULL REFERENCES users(id),
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  joined_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, workspace_id)
);
```

### 5.3 Pages & Tree

```sql
CREATE TABLE pages (
  id            TEXT PRIMARY KEY,       -- ulid
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  parent_id     TEXT REFERENCES pages(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT 'Untitled',
  icon          TEXT,                   -- emoji or uploaded image ref
  cover_url     TEXT,
  position      REAL NOT NULL,          -- fractional indexing for sibling ordering
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at   TEXT                    -- soft delete
);

CREATE INDEX idx_pages_parent ON pages(workspace_id, parent_id, position);
CREATE INDEX idx_pages_workspace ON pages(workspace_id, archived_at);
```

#### Page tree semantics

- **Ordering**: Fractional indexing (`position` as REAL). Inserting between positions A and B uses (A+B)/2. No sibling updates needed.
- **Move**: Update `parent_id` and `position` in a single `db.batch()`. The old parent's children are unaffected.
- **Archive (soft delete)**: Sets `archived_at`. Page disappears from sidebar. Children become orphans (their `parent_id` is SET NULL, promoting them to root). No trash UI in v1.
- **Hard delete**: Admin/CLI only. Deletes linked `doc_snapshots`, `page_shares`, `pages_fts`, `uploads` rows + R2 objects in FK-safe order via `db.batch()`.
- **Restore**: Admin/CLI only, or via D1 Time Travel for disaster recovery.
- **URL structure**: `/:workspaceSlug/:pageId` — ULIDs are URL-safe and unique. No human-readable slugs per page (avoids rename collisions).
- **Max depth**: Soft limit of 10 levels enforced in the API. Breadcrumb walks and permission walks are bounded.

### 5.4 Document Content (Yjs Snapshots)

```sql
CREATE TABLE doc_snapshots (
  page_id       TEXT PRIMARY KEY REFERENCES pages(id),
  yjs_state     BLOB NOT NULL,          -- Y.encodeStateAsUpdate(ydoc)
  snapshot_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Persistence mode: snapshot.** `y-partyserver` is configured with `onLoad`/`onSave` callbacks (snapshot mode). The full Yjs state vector is saved as a single blob on debounced save. Offline merge works because `y-indexeddb` and the server snapshot converge via the Yjs CRDT merge on reconnect.

**D1 BLOB limit: 2MB.** D1's maximum row/BLOB size is 2MB. A typical text-heavy page serializes to 50–200KB, so this is generous. If a document approaches the limit (heavy image-alt-text, massive code blocks), `onSave` should log a warning. Client-side BlockNote enforcement (max 10,000 blocks) keeps documents well within budget.

### 5.5 Permissions & Sharing

```sql
CREATE TABLE page_shares (
  id            TEXT PRIMARY KEY,       -- ulid
  page_id       TEXT NOT NULL REFERENCES pages(id),
  grantee_type  TEXT NOT NULL CHECK (grantee_type IN ('user', 'link')),
  grantee_id    TEXT,                   -- user_id for 'user', NULL for 'link'
  permission    TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
  link_token    TEXT UNIQUE,            -- for link shares
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_page_shares_page ON page_shares(page_id);
CREATE INDEX idx_page_shares_grantee ON page_shares(grantee_type, grantee_id);
```

#### Share model

- **Private workspace only** (default): Only workspace members with sufficient role can access.
- **User share**: Grant a specific user `view` or `edit` on a specific page. Does not require workspace membership.
- **Secret link**: Anyone with the link token can view or edit (based on `permission`). Permanent until revoked. No expiry in v1.
- **Subtree inheritance**: Child pages inherit their parent's shares unless they have their own `page_shares` entry. Inheritance is **replace, not merge** — if a child has any shares, the parent's shares do not apply to that child for share-derived access. This does **not** revoke workspace-role access for `owner`, `admin`, or `member`. See §20.2 for the full truth table.
- **Share management**: Workspace `member` may create a user share only for a user who already belongs to the same workspace, and may revoke only such shares they created. Workspace `member` may not create link shares and may not share with non-members. Workspace `owner` and `admin` may create or revoke any share. Workspace `guest` may not create or revoke shares.
- **No `full_access` in v1**: Only `view` and `edit`. Page deletion still follows workspace/page-role rules.

### 5.6 Full-Text Search

```sql
CREATE VIRTUAL TABLE pages_fts USING fts5(
  page_id UNINDEXED,
  title,
  body_text,
  tokenize='trigram'
);
```

`trigram` tokenizer indexes 3-character sequences. It works for both English and CJK (Chinese/Japanese/Korean) out of the box — `porter unicode61` cannot tokenize CJK text at all because it requires whitespace word boundaries. Tradeoff: larger index, no stemming. Irrelevant at bland's scale.

#### Search pipeline

Search indexing happens asynchronously via Queues, not on the request path:

1. `DocSync.onSave` persists the Yjs snapshot to D1 and enqueues a `search-index` message to Queues with the `page_id`.
2. The Queue consumer loads the snapshot from `doc_snapshots`, decodes it into a `Y.Doc`, and extracts plaintext.
3. Plaintext extraction normalizes: page title, all heading text, paragraph text, list item text, code block content, image alt text. Callout and toggle content is included. Embeds are excluded.
4. The consumer writes to `pages_fts` via raw SQL — delete existing row for `page_id`, then insert new row. FTS5 virtual tables don't support `REPLACE INTO` or unique constraints, so idempotency is achieved via delete-before-insert.

If the FTS index is ever corrupted, a rebuild script iterates all `doc_snapshots` and re-indexes.

**Scope**: Title + full content. Attachments (PDFs, images) are not indexed in v1.

### 5.7 File Uploads

```sql
CREATE TABLE uploads (
  id            TEXT PRIMARY KEY,       -- ulid
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  page_id       TEXT REFERENCES pages(id), -- which page references this upload (nullable for orphans)
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  r2_key        TEXT NOT NULL,          -- R2 object key
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Asset model

R2 is the canonical store for all uploads. Public or permanent R2 URLs are never exposed to browsers. The only browser-visible R2 URL is a short-lived presigned PUT URL for upload; reads always go through the Worker at `/uploads/:id`.

Uploads do not have a standalone ACL in v1. Access is derived from the linked page plus workspace/share checks.

- **Upload flow**: Client requests a presigned R2 PUT URL (`POST /api/v1/workspaces/:wid/uploads/presign`). The Worker validates `Content-Length` from the request (reject if >10MB) and records metadata in D1 optimistically. Client uploads directly to R2. If the R2 PUT never completes, `GET /uploads/:id` returns 404 — no harm.
- **R2 CORS**: The `bland-uploads` bucket must have a CORS policy allowing PUT from `bland.tools` origins. Required for browser-based presigned uploads.
- **Serving (authenticated users)**: `GET /uploads/:id` accepts the refresh cookie (sent automatically by the browser on same-origin requests). The Worker validates the cookie, checks the user's permission on the linked page, then streams from R2.
- **Serving (shared-link users)**: `GET /uploads/:id?share=<token>` — the Worker validates the share token against `page_shares`, checks the upload is linked to that page, then streams from R2.
- **Max size**: 10MB per file (soft limit). Enforced by the Worker at presign time (check requested `Content-Length`) and client-side. R2 presigned URLs do not enforce size — a malicious client could bypass the check. Acceptable for an invite-only workspace with ≤50 trusted users. Add post-upload size validation in v2 if needed.
- **MIME allowlist**: Images (jpeg, png, gif, webp, heic), PDFs. No executables, **no SVG** (XSS risk when served from same origin — reconsider in v2 with sanitization or a hardened asset subdomain).
- **Private by default**: No public R2 URLs. All access is Worker-gated.
- **No variant generation in v1**: Serve originals. When image resizing is needed, add Cloudflare Images URL-based transforms over R2 — zero code changes to the upload pipeline, free tier covers 5,000 unique transforms/month.
- **No separate upload confirm endpoint**: Presign records the D1 row. If the user never uploads, the row points to a nonexistent R2 object. This is harmless and avoids a round-trip.

---

## 6. Durable Object: DocSync

The real-time engine. One instance per page. A `YServer` subclass from `y-partyserver`, declared as a Durable Object class in `wrangler.jsonc`.

### Deployment

`partyserver` and `y-partyserver` run as Durable Object classes inside the same Wrangler Worker project — not as a separate PartyKit deployment. The DO class is declared in `wrangler.jsonc` with `new_sqlite_classes`, gets the same D1/R2/Queue bindings as the Worker, and is routed to via `routePartykitRequest(request, env)` in the Worker's fetch handler.

### Persistence: Snapshot Mode

`y-partyserver` offers snapshot mode, history mode, and custom hooks. bland uses **snapshot mode** via `onLoad`/`onSave` callbacks:

- `onLoad`: Load the full Yjs state vector from D1 on cold start.
- `onSave`: Persist the full state vector to D1 on debounced save (2s wait, 10s max wait).
- No incremental update log. The snapshot is the full truth.
- Hibernation is enabled. When all clients disconnect and the debounce fires, the DO saves and hibernates. State is reloaded from D1 on next connection.

This is sufficient because bland does not offer user-facing version history. The Yjs CRDT merge guarantees that offline edits (from `y-indexeddb`) and the server snapshot converge correctly on reconnect without needing the full edit history.

### Implementation

> **Note**: The code below shows the _pattern_ (load from D1, save snapshot + title sync, enqueue search indexing). The exact `onLoad`/`onSave` method signatures must be verified against the installed `y-partyserver` version — the API has evolved across releases.

```ts
import { YServer } from "y-partyserver";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { docSnapshots, pages } from "@/worker/db/schema";
import * as Y from "yjs";

export class DocSync extends YServer {
  static callbackOptions = {
    debounceWait: 2000,
    debounceMaxWait: 10000,
  };

  private get db() {
    return drizzle(this.env.DB);
  }

  async onLoad(): Promise<Uint8Array | null> {
    const row = await this.db
      .select({ yjsState: docSnapshots.yjsState })
      .from(docSnapshots)
      .where(eq(docSnapshots.pageId, this.name))
      .get();
    return row?.yjsState ?? null;
  }

  async onSave(state: Uint8Array): Promise<void> {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, state);
    const title = ydoc.getText("page-title").toString();

    await this.db.batch([
      this.db
        .insert(docSnapshots)
        .values({ pageId: this.name, yjsState: state, snapshotAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: docSnapshots.pageId,
          set: { yjsState: state, snapshotAt: new Date().toISOString() },
        }),
      this.db.update(pages).set({ title, updatedAt: new Date().toISOString() }).where(eq(pages.id, this.name)),
    ]);

    await this.env.SEARCH_QUEUE.send({ type: "index-page", pageId: this.name });
  }
}
```

### Presence and Awareness

Yjs awareness is ephemeral by design — cursor positions, user names, and colors are broadcast to all peers but never stored in the Yjs document, D1, or R2. When a user disconnects, their awareness state is automatically removed. This is the correct behavior for live cursors and presence indicators.

### What y-partyserver gives you for free

| Concern                       | Handled by                                     |
| ----------------------------- | ---------------------------------------------- |
| WebSocket lifecycle           | `PartyServer` base class                       |
| Yjs sync protocol             | `YServer`                                      |
| Awareness (cursors, presence) | Built into `YServer`, ephemeral                |
| Reconnection + buffering      | `PartySocket` client                           |
| Hibernation support           | `connection.setState()` + `getConnections()`   |
| Persistence debounce          | `callbackOptions`                              |
| Custom messages               | `provider.sendMessage()` / `onCustomMessage()` |

---

## 7. Background Work: Queues

Search indexing runs off the critical save path via Cloudflare Queues.

### Queue: `bland-tasks`

| Message type | Producer         | Consumer action                                                |
| ------------ | ---------------- | -------------------------------------------------------------- |
| `index-page` | `DocSync.onSave` | Load snapshot from D1, extract plaintext, write to `pages_fts` |

One message type, one consumer handler. FTS failure must not roll back the snapshot — that's the only reason this isn't inline. Invite links are copy-paste (no email service in v1). Image variants are cut (serve originals, add Cloudflare Images URL transforms later with zero code). Orphan uploads cost pennies and can be cleaned manually.

Future message types (email delivery, image processing) can be added by extending the consumer — the infrastructure is already in place.

---

## 8. Auth, Sessions & Abuse Controls

### Design: Invite-only + JWT + Turnstile

No public signup. Any workspace member (member role or above) can invite others to workspaces they belong to. Only owner/admin can assign admin role to invitees. Members can only invite as `member` or `guest`.

### Auth Flow

1. **Existing user creates invite**: `POST /api/v1/workspaces/:wid/invite` with target email and role → generates invite token (random, 32 bytes, base64url) → expiry 7 days → returns invite link for copy-paste.
2. **Recipient opens invite link**: `GET /api/v1/invite/:token` → validates token, checks expiry, checks not revoked.
3. **If recipient has account**: Accept invite → Turnstile challenge → add membership → response includes workspace data → client navigates to workspace.
4. **If recipient is new**: Show account creation form → Turnstile challenge → create user (Argon2id hash) → accept invite → response includes workspace data → client navigates to workspace.
5. **Login**: `POST /api/v1/auth/login` → Turnstile challenge → verify password → issue JWT pair.
6. **JWT pair**: Short-lived access token (15min, HS256, includes `sub`, `iat`, `exp`, `jti`) + longer-lived refresh token (7 days, `HttpOnly`, `Secure`, `SameSite=Strict` cookie).
7. **Token refresh**: `POST /api/v1/auth/refresh` → validate refresh cookie → issue new access token.
8. **Logout**: Clear refresh cookie. Access token expires naturally in ≤15min. No denylist needed — the short lifetime is the revocation mechanism.
9. **Logout everywhere**: Rotate the JWT signing secret (nuclear option) or add a `token_generation` counter to the user record and check it on every request (lighter option, v2).

### Session model

- Access tokens are stateless (no server-side session store).
- Refresh tokens are stored as `HttpOnly` cookies, not in localStorage.
- No KV session store in v1. The 15-minute access token lifetime limits the blast radius of a leaked token without requiring a denylist.
- WebSocket auth: JWT or share token passed as query param on upgrade. Validated once at connection time. If the token expires mid-session, the connection stays alive (Yjs state is already synced). Re-auth happens on reconnect.

### Abuse controls

Rate limiting uses **Cloudflare Rate Limiting Binding** — a native Workers API that runs against locally cached counters with no network overhead. The binding only supports `period` values of **10 or 60 seconds**, so hourly limits are handled by Turnstile and the general API rate limit, not dedicated bindings.

```jsonc
// wrangler.jsonc (partial)
"ratelimits": [
  { "name": "RL_AUTH", "namespace_id": "1001", "simple": { "limit": 10,  "period": 60 } },
  { "name": "RL_API",  "namespace_id": "1002", "simple": { "limit": 300, "period": 60 } }
]
```

| Surface                          | Control                                                                                | Key                     |
| -------------------------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| Login                            | Turnstile + `RL_AUTH` (10/min)                                                         | IP (`cf-connecting-ip`) |
| Invite accept / account creation | Turnstile                                                                              | —                       |
| Invite creation                  | `RL_API` (300/min covers all authenticated endpoints)                                  | User ID                 |
| API (authenticated)              | `RL_API` (300/min)                                                                     | User ID                 |
| File upload                      | `RL_API` + 10MB max per file (Worker validates Content-Length at presign)              | User ID                 |
| WebSocket connect                | 5 concurrent connections per user per document                                         | User ID + page ID       |
| WAF                              | Cloudflare managed rules + custom WAF rate limiting rules for longer windows if needed | —                       |

**Turnstile implementation**: Reuse the proven pattern from flamemail (`src/client/components/turnstile-widget.tsx`). Key details:

- Load script explicitly with `?render=explicit`
- Use `interaction-only` appearance (invisible unless challenged), dark theme, `flexible` size
- Server-side validation via `verifyTurnstileToken(env, { token, expectedAction, remoteIp, requestUrl })`
- Each protected form gets a unique `action` string (e.g., `create_account`, `login`, `accept_invite`)
- Widget resets via `resetKey` prop after each form submission attempt

**Turnstile** requires server-side validation of the `cf-turnstile-response` token on every protected form submission. The site key is public (frontend), the secret key is a Worker secret.

### First User Bootstrap

A CLI seed command (`npm run db:seed-initial-user -- --local --email <email> --name <name>`) creates the first user, workspace, and owner membership directly. The user logs in with those credentials and invites others normally. No bootstrap invite needed.

---

## 9. Permission Model

### Hierarchy

```
Workspace
  ├── Workspace role baseline (owner > admin > member > guest)
  └── Page-level grants (page_shares)
        └── Inherited by child pages unless overridden
```

### Resolution Algorithm

```
function canAccess(principal, page, action):
  membership = principal.user ? getMembership(principal.user, page.workspace_id) : null

  // Workspace role is the baseline for real members.
  if membership and membership.role in ['owner', 'admin', 'member']:
    return rolePermission(membership.role) >= action

  // Shares only grant view/edit. They do not revoke workspace access.
  if action not in ['view', 'edit']:
    return false

  // Guests and non-members resolve via page shares.
  current = page
  while current (max 10 levels):
    if hasAnyShares(current):
      share = getShareForPrincipal(current, principal)
      if share: return share.permission >= action
      return false  // Child shares replace inherited shares. Stop here.
    current = current.parent

  return false
```

The key rule: `replace, not merge` applies to inherited `page_shares`, not workspace membership. A child page with its own shares cuts off ancestor shares for share-derived access, but it does **not** hide that page from workspace `owner`, `admin`, or `member`. See §20.2 for the full consequences.

### Actions Matrix

| Role / Permission | View        | Edit       | Share with members | Share with non-members / link | Archive   | Manage Workspace |
| ----------------- | ----------- | ---------- | ------------------ | ----------------------------- | --------- | ---------------- |
| Owner             | ✓           | ✓          | ✓                  | ✓                             | ✓         | ✓                |
| Admin             | ✓           | ✓          | ✓                  | ✓                             | ✓         | ✗                |
| Member            | ✓           | ✓          | ✓                  | ✗                             | Own pages | ✗                |
| Guest             | Shared only | If granted | ✗                  | ✗                             | ✗         | ✗                |
| Link (view)       | ✓           | ✗          | ✗                  | ✗                             | ✗         | ✗                |
| Link (edit)       | ✓           | ✓          | ✗                  | ✗                             | ✗         | ✗                |

Hard delete is not a normal user action in v1. It is an owner/operator destructive path described in §20.11.

---

## 10. API Surface

Base: `https://bland.tools/api/v1`

### URL topology

- **Single domain**: `bland.tools` serves everything — SPA, API, uploads, WebSocket.
- **Worker**: Cloudflare Workers handles API routes (`/api/v1/*`), WebSocket (`/ws/*`), uploads (`/uploads/*`), shared links (`/s/*`). Non-API paths fall through to the SPA (static assets via Workers Assets binding, catch-all to `index.html` for client-side routing).
- **Cookie**: Refresh cookie is same-origin — no `Domain` attribute needed (defaults to exact origin). No cross-subdomain concerns.
- **Image URLs in editor**: Stored as relative paths (`/uploads/:id`) in the Y.Doc. The browser sends the refresh cookie automatically (same-origin).
- **Shared-link follow-on auth**: Existing endpoints accept `?share=<token>` as alternative auth. No dedicated shared-link routes needed beyond `GET /s/:token` for initial access.

### 10.1 Auth

| Method | Path                   | Description                        |
| ------ | ---------------------- | ---------------------------------- |
| POST   | `/api/v1/auth/login`   | Turnstile + credentials → JWT pair |
| POST   | `/api/v1/auth/refresh` | Refresh access token via cookie    |
| POST   | `/api/v1/auth/logout`  | Clear refresh cookie               |
| GET    | `/api/v1/auth/me`      | Current user profile               |

### 10.2 Invites

| Method | Path                             | Description                                    |
| ------ | -------------------------------- | ---------------------------------------------- |
| POST   | `/api/v1/workspaces/:wid/invite` | Create invite (rate limited)                   |
| GET    | `/api/v1/invite/:token`          | Validate invite                                |
| POST   | `/api/v1/invite/:token/accept`   | Turnstile + accept (creates account if needed) |
| DELETE | `/api/v1/invite/:id`             | Revoke invite                                  |

### 10.3 Workspaces

| Method | Path                                  | Description                   |
| ------ | ------------------------------------- | ----------------------------- |
| POST   | `/api/v1/workspaces`                  | Create workspace              |
| GET    | `/api/v1/workspaces`                  | List user's workspaces        |
| PATCH  | `/api/v1/workspaces/:id`              | Update workspace settings     |
| DELETE | `/api/v1/workspaces/:id`              | Delete workspace (owner only) |
| GET    | `/api/v1/workspaces/:id/members`      | List members                  |
| PATCH  | `/api/v1/workspaces/:id/members/:uid` | Change role                   |
| DELETE | `/api/v1/workspaces/:id/members/:uid` | Remove member                 |

### 10.4 Pages

| Method | Path                                         | Description                                                                                                                                        |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/workspaces/:wid/pages`              | Create page (specify parent, position)                                                                                                             |
| GET    | `/api/v1/workspaces/:wid/pages`              | List root pages (sidebar tree, non-archived)                                                                                                       |
| GET    | `/api/v1/workspaces/:wid/pages/:id`          | Get page metadata                                                                                                                                  |
| GET    | `/api/v1/workspaces/:wid/pages/:id/children` | Get child pages                                                                                                                                    |
| PATCH  | `/api/v1/workspaces/:wid/pages/:id`          | Update icon, cover, position, parent (move = PATCH with new parent_id + position). Title is read-only here — it comes from the Y.Doc via `onSave`. |
| DELETE | `/api/v1/workspaces/:wid/pages/:id`          | Archive page (soft delete)                                                                                                                         |

Breadcrumbs are computed client-side from the Zustand page tree cache. No dedicated endpoint.

### 10.5 Real-Time (WebSocket)

| Path                        | Description                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/ws/doc/:pageId?token=...` | WebSocket upgrade → Durable Object. Auth via JWT (`token` param) or share token (`share` param). Yjs sync + awareness (ephemeral). |

### 10.6 Search

| Method | Path                                   | Description                                 |
| ------ | -------------------------------------- | ------------------------------------------- |
| GET    | `/api/v1/workspaces/:wid/search?q=...` | FTS5 query, scoped to pages user can access |

### 10.7 Uploads

| Method | Path                                      | Description                                                                                                                            |
| ------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/workspaces/:wid/uploads/presign` | Validates Content-Length ≤10MB, records metadata in D1, returns presigned R2 PUT URL + upload ID                                       |
| GET    | `/uploads/:id`                            | Serve file. Auth via refresh cookie (same-origin) or `?share=<token>` (shared-link users). Returns 404 if R2 object doesn't exist yet. |

No separate confirm endpoint. Presign records the D1 row optimistically.

### 10.8 Sharing

| Method | Path                               | Description                                                                            |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/api/v1/pages/:id/share`          | Create share (user or link)                                                            |
| GET    | `/api/v1/pages/:id/share`          | List shares on a page                                                                  |
| DELETE | `/api/v1/pages/:id/share/:shareId` | Revoke share                                                                           |
| GET    | `/s/:token`                        | Access shared page via link. Returns page metadata + the token for follow-on requests. |

**Share authorization**:

- Workspace `member` may create `user` shares only for users who already have a membership in the same workspace.
- Workspace `member` may not create link shares and may not create shares for non-members.
- Workspace `member` may revoke only workspace-member user shares they created.
- Workspace `owner` and `admin` may create or revoke any share.
- Workspace `guest` may not create or revoke shares.
- `GET /api/v1/pages/:id/share` must not expose raw `link_token` values to callers who are not allowed to manage link shares.

**Shared-link session**: The share token serves as auth for all follow-on requests from non-member users: WebSocket (`/ws/doc/:pageId?share=<token>`), uploads (`/uploads/:id?share=<token>`), child pages (`/api/v1/workspaces/:wid/pages/:id/children?share=<token>`). The DO and upload endpoint validate the share token against `page_shares` when no JWT/cookie is present.

---

## 11. Frontend Architecture

### Directory Layout

```
src/
  client/
    main.tsx
    app.tsx
    components/
      app-shell.tsx
      header.tsx              # devbin.tools standard (auto-hide on scroll)
      footer.tsx              # devbin.tools standard (hidden on mobile)
      sidebar/
        sidebar.tsx
        page-tree.tsx
        page-tree-item.tsx
        search-dialog.tsx     # Cmd+K
      editor/
        editor-pane.tsx
        top-bar.tsx           # Breadcrumb + share + presence
        icon-picker.tsx
        cover-picker.tsx
      auth/
        login-page.tsx
        invite-page.tsx
        turnstile-widget.tsx  # Ported from flamemail
      presence/
        avatar-stack.tsx
        sync-status.tsx       # Green/yellow/gray dot
      toast.tsx
      ui/                     # devbin.tools standard primitives
        button.tsx, card.tsx, input.tsx, dialog.tsx, badge.tsx, etc.
    hooks/
      use-editor.ts
      use-sync-status.ts
      use-auth.ts
    stores/
      workspace-store.ts      # Zustand + persist (localStorage)
      auth-store.ts
    pages/
    styles/
      app.css                 # devbin.tools standard
  shared/
    types.ts
    contracts/
  worker/
    index.ts                  # Hono app
    middleware/
      auth.ts
      turnstile.ts            # Server-side token validation (ported from flamemail)
      rate-limit.ts           # Hono middleware wrapping Rate Limiting Binding
    routes/
    queues/
      search-indexer.ts
    durable-objects/
      doc-sync.ts
```

### Block Types (v1)

Paragraph, Heading (1–3), Bulleted list, Numbered list, To-do, Quote, Callout, Code block, Image, Divider, Toggle, Table (simple), Embed (iframe).

---

## 12. Offline Strategy

### Precise scope

**Per-document offline editing** for previously visited pages. This is not a full offline-first architecture.

| What works offline                   | How                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Editing a page you've already opened | `y-indexeddb` has the full Y.Doc locally. Edits continue.                                                                            |
| Reading a page you've already opened | Y.Doc loads from IndexedDB instantly.                                                                                                |
| Reconnecting and merging             | Yjs CRDT merge. Client sends its state vector, server responds with missing updates (and vice versa). No manual conflict resolution. |

| What does NOT work offline          | Why                                                          |
| ----------------------------------- | ------------------------------------------------------------ |
| Creating, moving, or deleting pages | These are workspace metadata mutations that require the API. |
| Opening a page you've never visited | No local Y.Doc exists in IndexedDB.                          |
| Searching                           | FTS5 runs on D1 server-side.                                 |
| Uploading files                     | Requires presigned URL from API + R2.                        |
| Sharing or inviting                 | Requires API.                                                |

### Workspace metadata: online-first with stale cache

Zustand + `persist` middleware snapshots the page tree and member list to `localStorage`. On load, the cached state renders immediately (sidebar appears instantly), then a background fetch refreshes it. When offline, the sidebar shows the cached tree and mutation buttons are disabled with a tooltip.

### UI indicators

- Sync status dot in the top bar: green (connected), yellow pulse (syncing), gray (offline)
- "Offline — changes will sync when you reconnect" banner when offline
- Disabled mutation buttons with "You're offline" tooltip

---

## 13. Recovery & Restore

### D1 Time Travel

D1 Time Travel is always on and supports point-in-time restore within the last 30 days. This is the disaster recovery mechanism for accidental deletes, bad migrations, or data corruption.

### Durable Object PITR

SQLite-backed Durable Objects also support point-in-time restore.

### Restore runbook

| Scenario                               | Recovery                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| User accidentally archives a page      | Admin unsets `archived_at` in D1. Children were orphaned on archive (promoted to root).       |
| Bad migration corrupts `pages` table   | D1 Time Travel: restore to pre-migration point. Redeploy Worker with fixed migration.         |
| Bad migration corrupts `doc_snapshots` | D1 Time Travel: restore snapshots. DO will reload from restored snapshot on next connection.  |
| Yjs doc corruption in a live DO        | Force-evict the DO (deploy a dummy migration tag). It reloads from the last good D1 snapshot. |
| FTS index corruption                   | Drop and rebuild `pages_fts` from `doc_snapshots`. Run rebuild script.                        |
| R2 object deleted                      | R2 does not have Time Travel. Object is gone. Keep D1 `uploads` row for audit trail.          |

---

## 14. Deployment & Configuration

### wrangler.jsonc

```jsonc
{
  "name": "bland",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-03-01",
  "routes": [{ "pattern": "bland.tools/*", "zone_name": "bland.tools" }],
  "d1_databases": [{ "binding": "DB", "database_name": "bland-prod", "database_id": "..." }],
  "r2_buckets": [{ "binding": "R2", "bucket_name": "bland-uploads" }],
  "queues": {
    "producers": [{ "binding": "SEARCH_QUEUE", "queue": "bland-tasks" }],
    "consumers": [{ "queue": "bland-tasks", "max_batch_size": 10, "max_batch_timeout": 5 }],
  },
  "durable_objects": {
    "bindings": [{ "name": "DOC_SYNC", "class_name": "DocSync" }],
  },
  "ratelimits": [
    { "name": "RL_AUTH", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } },
    { "name": "RL_API", "namespace_id": "1002", "simple": { "limit": 300, "period": 60 } },
  ],
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["DocSync"] }],
}
```

### Environments

- **Production**: `bland.tools` (single domain — Worker serves API + SPA)
- **Staging**: `staging.bland.tools`
- Separate D1 databases, R2 buckets, and Queues per environment

### Source Control

Hosted on **git-on-cloudflare** at `git-on-cloudflare.com/rachel/bland`.

### CI: anvil

anvil handles continuous integration only — lint, typecheck, test, build. Deployment is manual via `npm run deploy`.

Pipeline defined in `.anvil.yml` at repo root, triggered by webhook on push:

```yaml
# .anvil.yml
version: 1
checkout:
  depth: 1
run:
  workingDirectory: .
  timeoutSeconds: 720
  steps:
    - name: install
      run: npm ci
    - name: typecheck
      run: npm run typecheck
    - name: test
      run: npm test
    - name: build
      run: npm run build
```

### Deploy (manual)

```bash
npm run deploy              # staging: applies D1 migrations, builds, deploys
npm run deploy -- --env production  # production
```

`npm run deploy` applies D1 migrations first, then builds and deploys the Worker (same pattern as anvil itself). Staging and production are separate wrangler environments with separate D1/R2/Queue bindings.

### D1 Migrations

Managed via Drizzle ORM's migration generator (`npm run db:generate`) + `wrangler d1 migrations apply`. Migration files in `drizzle/` directory.

---

## 15. Performance Targets

| Metric                    | Target                         |
| ------------------------- | ------------------------------ |
| API response (P95)        | < 100ms                        |
| Page load (editor ready)  | < 1.5s                         |
| Time to first edit        | < 500ms (from IndexedDB cache) |
| WebSocket round-trip      | < 100ms                        |
| Search results            | < 200ms                        |
| Worker cold start         | < 10ms                         |
| Durable Object cold start | < 50ms (excluding D1 read)     |
| Lighthouse performance    | > 90                           |

---

## 16. Cost Estimation

For ~1,000 active users:

| Resource         | Usage Estimate            | Monthly Cost   |
| ---------------- | ------------------------- | -------------- |
| Workers requests | 10M                       | ~$5            |
| Durable Objects  | 5M requests + 100K hrs    | ~$20           |
| D1               | 50M rows read, 5M written | ~$10           |
| Queues           | 5M messages               | ~$2            |
| R2               | 50 GB stored, 5M reads    | ~$3            |
| Pages (frontend) | Static                    | Free           |
| **Total**        |                           | **~$40/month** |

Scales roughly linearly. At 10K users, expect ~$300–500/month. Removing KV saves ~$7/mo and eliminates a consistency headache.

---

## 17. Observability

- **Error tracking**: Sentry (Workers + client)
- **Logging**: Workers `console.log` → Logpush to R2 or external
- **Metrics**: Cloudflare Analytics + Queue consumer metrics (index latency, failure rate)
- **Health check**: `GET /health` returns 200 with D1/R2/Queue connectivity status

---

## 18. Security

- All traffic over HTTPS (Cloudflare terminates TLS)
- JWT access tokens: 15min lifetime, HS256, includes `sub`, `iat`, `exp`, `jti`
- Refresh tokens: `HttpOnly`, `Secure`, `SameSite=Strict` cookies, 7-day lifetime
- Passwords hashed with Argon2id
- Turnstile on login, invite accept, and account creation
- WebSocket auth: JWT or share token validated on upgrade, rejected before Yjs state is sent
- File uploads: presigned R2 URLs (no user content passes through Worker body)
- Upload serving: Worker-gated via refresh cookie (members) or share token (shared-link users), checks permission against D1 before serving from R2
- Input validation on all API endpoints (Zod or en-garde)
- CORS: restricted to `bland.tools` origins
- CSP: strict, no inline scripts
- WAF: Cloudflare managed rules + custom rate limiting rules

---

## 19. Milestones

### M1: Foundation (Weeks 1–2)

- [ ] Create repo on git-on-cloudflare (`rachel/bland`)
- [ ] Anvil pipeline: install → typecheck → test → build
- [ ] Project scaffold (Wrangler + Hono + Vite 8 + React 19 + Tailwind v4)
- [ ] D1 schema + Drizzle migrations
- [ ] Auth (invite flow, login, JWT, Turnstile)
- [ ] Workspace CRUD (API + frontend: create, rename, switch between workspaces)
- [ ] Page CRUD (API + frontend: create, archive from sidebar and page view)
- [ ] BlockNote editor with y-indexeddb (local-only persistence, no server sync)
- [ ] Page tree sidebar
- [ ] Breadcrumb navigation
- [ ] devbin.tools header + footer
- [ ] Rate limiting middleware
- [ ] Health endpoint
- [ ] First-user bootstrap (`npm run db:seed-initial-user`)

_Testable: create account → join workspace → create page → write content → content persists locally per-device. Titles show "Untitled" in sidebar until M2 lands title sync. No server-side content persistence yet._

### M2: Sync & Persistence (Weeks 3–4)

- [ ] DocSync Durable Object (y-partyserver YServer subclass)
- [ ] WebSocket sync (multi-user — y-partyserver handles single and multi identically)
- [ ] Cursor presence / awareness (avatar stack + remote cursors)
- [ ] Sync status indicator
- [ ] Title sync (Y.Doc → D1 `pages.title` via onSave)
- [ ] Content persistence (Y.Doc → D1 `doc_snapshots` via onSave)

_Testable: two users edit the same page, see each other's cursors, edits persist to server, titles update in sidebar, content survives across devices._

### M3: Content Features (Weeks 5–6)

- [ ] Image upload (R2 presigned URLs + Worker-gated serving)
- [ ] Queues: search indexer
- [ ] Full-text search (FTS5 + Cmd+K dialog)
- [ ] Page icons and covers

_Testable: upload images into pages, search across workspace, customize page appearance._

### M4: Sharing & Access (Weeks 7–8)

- [ ] Sharing (user invite + secret link + editable link)
- [ ] Permission enforcement on API + WebSocket
- [ ] Shared-link access flow (`GET /s/:token`)
- [ ] Workspace settings page
- [ ] User menu / profile

_Testable: share a page with a non-member via link, they can view/edit based on permission._

### M5: Polish (Weeks 9–10)

- [ ] Slash command menu styling
- [ ] Drag-and-drop blocks
- [ ] Page tree drag-to-reorder
- [ ] Offline UX (banners, disabled buttons, tooltips)
- [ ] Mobile responsive layout
- [ ] Header auto-hide on scroll
- [ ] Footer hide on mobile

_Testable: use the app on mobile, works offline for visited pages, smooth drag interactions._

### M6: Production Readiness (Weeks 11–12)

- [ ] Error tracking (Sentry)
- [ ] Observability (logging, Logpush)
- [ ] E2E test suite (Playwright)
- [ ] Security review
- [ ] Recovery runbook tested (D1 Time Travel restore, FTS rebuild)
- [ ] Deploy runbook documented (staging + production manual deploy steps)
- [ ] Documentation

_Testable: deploy to production with monitoring, automated tests, and documented recovery procedures._

---

## 20. Hard Contracts

These are the precise rules that keep a docs product from getting weird in production. Each decision is final for v1.

### 20.1 Asset Lifecycle

Uploads are **page-scoped, not reusable across pages**. The `page_id` on the `uploads` table is the ownership link. References inside Yjs document blocks (image URLs pointing to `/uploads/:id`) are informational — they do not drive garbage collection.

- An upload belongs to one page. Moving an image block to another page in the editor does NOT update `uploads.page_id` — the image continues to be served **only if the viewer has access to the original page**. In restricted-subtree or shared-link scenarios, viewers of the destination page may not see copied images. This is a known v1 limitation; fix by transferring ownership in v2 if it surfaces.
- Deleting (archiving) a page does NOT delete its uploads. Uploads remain accessible if the page is restored.
- Hard-deleting a page ALWAYS deletes its uploads (D1 rows + R2 objects). Uploads are never orphaned from a hard delete.
- There is no cross-page image reuse in v1. If a user wants the same image on two pages, they upload it twice.
- Uploads where the R2 PUT never completed just return 404 on serve. Harmless. Clean up manually if it matters.

### 20.2 Share Inheritance: Replace, Not Merge

If a page has **any** `page_shares` entry, its share-derived access is evaluated from those entries alone. Parent shares are NOT merged in — the child's shares **replace** the inherited share chain for that page. This rule does **not** revoke workspace-role access for `owner`, `admin`, or `member`.

The permission walk is:

1. Is the requester a workspace `owner`, `admin`, or `member`? → Use workspace role. Stop.
2. Otherwise (`guest`, non-member user share, or link token), does this page have `page_shares`? → Use them. Stop.
3. Does the parent have `page_shares`? → Walk up. Stop at the first page with shares.
4. No page in the chain has shares? → Deny.

**Consequences**:

- Sharing a parent page with a guest gives them access to all children — unless a child has its own shares that exclude that guest.
- To restrict a subtree for shared users, add a share on the child. This cuts off inheritance from above.
- Workspace `owner`, `admin`, and `member` are not locked out by `page_shares`. If v2 needs deny-capable per-page ACLs, that is a separate feature.
- Sidebar visibility: workspace `owner`/`admin`/`member` see the normal workspace tree. `guest` and shared-link users only see pages where `canAccess(principal, page, 'view')` returns true.
- Breadcrumb visibility: for share-derived access, breadcrumb shows all ancestors, but ancestors the principal cannot access are shown as "Restricted" (no title leak).
- Search visibility: FTS query results are post-filtered by `canAccess`. Search never returns titles or snippets of pages the user cannot view.

### 20.3 Revocation + Offline Cache

When a user's access is revoked (removed from workspace, share deleted, role downgraded), they may still have cached content from `y-indexeddb` and `localStorage`.

**Product decision**: This is acceptable for v1. bland is a collaborative workspace, not a classified document system.

- On next WebSocket connect, the DocSync DO validates permissions. If denied, the connection is rejected with 403. The client shows "You no longer have access to this page."
- The client should best-effort clear the corresponding IndexedDB entry and remove the page from the Zustand sidebar cache on receiving a 403.
- There is no remote wipe of local storage. A revoked user retains whatever was in their browser cache until they revisit and the purge fires.
- This is stated in the product/security model so there are no surprises.

### 20.4 D1 Consistency Model

D1 read replication is eventually consistent. Write-then-read consistency across requests is handled via **bookmarks** — a session token that tells D1 "read at least as fresh as this point."

#### Middleware

A Hono middleware opens a D1 session per request, using either a client-provided bookmark (for cross-request consistency) or a constraint based on the request method/path:

```ts
app.use("*", async (c, next) => {
  const bookmark = c.req.header(D1_BOOKMARK_HEADER)?.trim();
  const d1 = openSession(c.env, bookmark || selectSessionConstraint(c.req.method, c.req.path));

  c.set("db", d1.db);

  try {
    await next();
  } finally {
    const nextBookmark = d1.getBookmark();
    if (nextBookmark) {
      c.header(D1_BOOKMARK_HEADER, nextBookmark);
    }
  }
});
```

The client reads the bookmark header from every response and sends it on the next request. This ensures that write-then-navigate flows (invite accept → load workspace, share create → reload page) read their own writes without forcing every query to primary.

#### Constraint selection

`selectSessionConstraint` picks the session mode based on the request:

| Request                               | Constraint           | Why                                                                      |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| Mutating requests (POST/PATCH/DELETE) | `first-primary`      | Writes go to primary. Follow-up reads in the same request see the write. |
| GET with client bookmark              | Use the bookmark     | Read at least as fresh as the client's last write.                       |
| GET without bookmark                  | Default (replica OK) | Low-latency reads from nearest replica.                                  |

### 20.5 Page Tree Mutation Rules

- **Cycle prevention**: Before a move, check that the target parent is not a descendant of the page being moved. Walk up from target parent to root (max 10 steps). If the moving page is found in the chain, reject with 400. The read and write are not atomic (see §20.12) — but the race window is infinitesimal at ≤50 users.
- **Fractional indexing**: IEEE 754 doubles give ~52 bisections before precision loss. Nobody reorders the same spot 52 times. No rebalancing logic in v1.
- **Archive → orphan to root**: Confirmed as intended UX. When a page is archived, its children become root-level pages (`parent_id` set to NULL). Simplest model, avoids cascading archive.

### 20.6 Session & Auth Contract

- **Access token storage**: In-memory only (Zustand store). Never in `localStorage` or cookies. Lost on tab close, which is fine — the refresh cookie reissues one.
- **Refresh token**: `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Single token, no rotation in v1. 7-day lifetime.
- **Asset serving auth**: `<img src="/uploads/:id">` cannot send an in-memory bearer token. Instead, `GET /uploads/:id` accepts the refresh cookie (sent automatically by the browser on same-origin requests). This dual-use of the refresh cookie is intentional — it avoids client-side blob URL complexity and extra presigning for GETs.
- **Device/session revocation**: No multi-device session list in v1. "Logout everywhere" is a v2 feature (requires a per-user token generation counter or refresh token table).
- **WebSocket origin check**: Validate `Origin` header on upgrade against allowed origins (`bland.tools`, `staging.bland.tools`, `localhost` in dev). Reject unknown origins.
- **Permission revoked while socket is open**: The socket is NOT forcibly closed. The user can continue editing until they disconnect. On next reconnect, the DO checks permissions and rejects. This is a pragmatic tradeoff — forcible eviction requires a push channel from D1 writes to active DOs, which is complex for v1.

### 20.7 Embed Security

- **iframe embeds**: BlockNote's embed block renders an `<iframe>` with `sandbox="allow-scripts allow-same-origin allow-popups"` and a domain allowlist. Default allowlist: YouTube, Vimeo, Figma, Google Docs/Sheets, Loom, CodePen, Excalidraw. Unknown origins are blocked.
- **SVG uploads**: Banned in v1 (see asset model). SVG embedded via iframe sandbox is acceptable if the source is on the allowlist.
- **CSP**: `default-src 'self'; frame-src` restricted to the allowlist domains. `img-src 'self'` (uploads are same-origin).

### 20.8 Search Contract

- **Archived pages**: Excluded from FTS results. When a page is archived, a Queue message removes its `pages_fts` entry. When restored, a Queue message re-indexes it.
- **Queue idempotency**: The `index-page` consumer deletes the existing FTS row for the `page_id`, then inserts the new one. Duplicate or out-of-order messages produce the correct final state (latest snapshot wins).
- **Tokenizer**: `trigram` — works for English, Chinese, and other CJK languages. No stemming (searching "running" won't match "run"), but correct multilingual tokenization is more important than stemming for a bilingual workspace.
- **Shared-link search**: Users accessing via shared links cannot search. Search is workspace-member-only.

### 20.9 Audit Log

No audit log in v1. At ≤50 users, "who changed this access?" is answered by asking the team. Add an `audit_log` table in v2 if a team actually asks for it.

### 20.10 Quotas

Only enforce limits that cost zero extra queries or are checked as part of existing logic:

| Resource                   | Limit     | Enforcement                                                                                                                     |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Max page tree depth        | 10 levels | Checked during move ancestor walk (already happening for cycle prevention)                                                      |
| Max doc snapshot size      | 2 MB      | D1 BLOB limit. `onSave` logs warning if approaching. Client-side block limit keeps docs well under.                             |
| Max file upload size       | 10 MB     | Soft limit: Worker checks Content-Length at presign + client-side. Bypassable by malicious client (acceptable for invite-only). |
| Max blocks per page        | 10,000    | Client-side BlockNote enforcement                                                                                               |
| Concurrent editors per doc | 20        | DO rejects WebSocket upgrade with 429 (one line in `onConnect`)                                                                 |

No server-side `SELECT COUNT(*)` checks before inserts. If a workspace accumulates 5,000 pages organically, that's fine — D1 handles it. Add hard quotas with counting queries in v2 if abuse becomes real.

### 20.11 Operator Runbooks: Destructive Paths

| Operation            | Procedure                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delete workspace** | Owner via API, or operator via CLI. Delete in FK-safe order via `db.batch()`: delete `uploads` rows → delete `doc_snapshots` → delete `page_shares` → delete `pages` → delete `memberships` → delete `invites` → delete `workspaces` row. Then delete R2 objects via script (list by prefix).                     |
| **Hard-delete page** | Delete in FK-safe order via `db.batch()`: delete `uploads` rows for the page → delete `doc_snapshots` row → delete `page_shares` rows → delete `pages_fts` row (raw SQL) → delete `pages` row. Then delete R2 objects for linked uploads via script. Uploads are ALWAYS deleted with their page — never orphaned. |
| **Queue failures**   | Queues retry failed messages 3 times with backoff. After 3 failures, messages are dropped (no DLQ configured — less infrastructure). FTS is a derived projection rebuildable from `doc_snapshots`, so lost index messages are harmless. Run the rebuild script if the index gets stale.                           |

### 20.12 D1 Transaction Model (Drizzle)

D1 does not support SQL-level `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`. Drizzle's `db.transaction()` throws on D1. All atomicity is via **`db.batch()`** — an array of prepared statements executed sequentially in an implicit transaction. If any statement fails, the entire batch rolls back.

**Constraint**: all statements must be prepared upfront. You cannot interleave JavaScript logic (read a row, branch on its value, then write) within the atomic unit.

**Pattern for bland**: read first, then batch the writes.

```ts
// Read phase (separate query, not atomic with writes)
const ancestors = await getAncestorChain(db, targetParentId);
if (ancestors.includes(pageId)) throw new HttpError(400, "Cycle detected");

// Write phase (atomic batch)
await db.batch([db.update(pages).set({ parentId: targetParentId, position: newPosition }).where(eq(pages.id, pageId))]);
```

**Known race conditions** (all acceptable at bland's scale):

| Race                                                       | Window                                   | Mitigation                                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent moves create a cycle                            | Between ancestor read and move batch     | Astronomically unlikely with ≤50 users. Pre-move ancestor walk is sufficient.                                                             |
| Permission check passes, then role is revoked before write | Between permission read and write batch  | Small window. The write itself doesn't check permissions — it relies on the prior read. Acceptable for v1.                                |
| Quota check passes, then concurrent insert exceeds limit   | Between count read and insert batch      | Quota may be exceeded by 1. Acceptable as a soft limit. Use SQL constraints (e.g., trigger or CHECK) for hard enforcement where critical. |
| Two users reorder siblings simultaneously                  | Between position read and position batch | Both writes succeed but one overwrites the other's position. Last-write-wins. The sidebar refreshes and shows the final state.            |

**Large cascade operations** (workspace deletion, sibling rebalancing) may involve many statements. D1 batch has no documented statement count limit, but keep batches reasonable (< 100 statements). For workspace deletion, split into multiple `db.batch()` calls if the statement count exceeds ~100.

---

## Appendix A: devbin.tools Accent Color

bland's accent palette (to be defined in `app.css` `@theme`):

| Token             | Value | Notes                                                                                     |
| ----------------- | ----- | ----------------------------------------------------------------------------------------- |
| Accent hue family | TBD   | Pick something distinct from blue (anvil), orange (flamemail), indigo (git-on-cloudflare) |

Candidates: teal/cyan, rose/pink, lime/green. The accent must work across the full 50–900 scale and produce a readable ambient glow at 2% opacity on `#09090b`.

---

## Appendix B: Open Questions

1. **Undo scope**: Yjs undo works within a browser session (the undo stack is in-memory). Closing the tab and reopening loses the undo history — this is inherent to Yjs, not a bug. Cross-session undo would require storing version snapshots in D1, which is a v2 feature if users ask for it.
