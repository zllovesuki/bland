import { YServer } from "y-partyserver";
import type { Connection, ConnectionContext } from "partyserver";
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { createDb } from "@/worker/db/d1/client";
import { pages } from "@/worker/db/d1/schema";
import * as docSyncSchema from "@/worker/db/docsync-do/schema";
import { createLogger, errorContext, setLevel } from "@/worker/lib/logger";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";
import { YJS_PAGE_TITLE } from "@/shared/constants";
import { parseDocMessage } from "@/shared/doc-messages";
import { extractPlaintext } from "@/worker/lib/yjs-text";
import docSyncMigrations from "../../../drizzle/docsync-do/migrations.js";

const MAX_CONNECTIONS_PER_DOC = 20;
const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5MB per chunk, under 2MB SQLite row limit
const log = createLogger("doc-sync");

const READONLY_TAG = "readonly";
const MEMBER_EDIT_TAG = "member_edit";

type DocSyncDb = DrizzleSqliteDODatabase<typeof docSyncSchema>;

interface YpsConnectionState {
  __ypsAwarenessIds?: number[];
}

/** Read awareness client IDs stored on the connection by y-partyserver. */
function getAwarenessIds(conn: Connection): readonly number[] {
  try {
    return (conn as Connection<YpsConnectionState>).state?.__ypsAwarenessIds ?? [];
  } catch {
    return [];
  }
}

function chunkBuffer(buf: Uint8Array, chunkSize: number): Uint8Array[] {
  if (buf.byteLength <= chunkSize) return [buf];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < buf.byteLength; offset += chunkSize) {
    chunks.push(buf.slice(offset, offset + chunkSize));
  }
  return chunks;
}

interface ChunkRow {
  chunk_index: number;
  data: Uint8Array;
}

function reassembleChunks(rows: ChunkRow[]): Uint8Array | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0].data;
  const sorted = [...rows].sort((a, b) => a.chunk_index - b.chunk_index);
  let totalLength = 0;
  for (const r of sorted) totalLength += r.data.byteLength;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const row of sorted) {
    result.set(row.data, offset);
    offset += row.data.byteLength;
  }
  return result;
}

export class DocSync extends YServer<Env> {
  static options = { hibernate: true };

  static callbackOptions = {
    debounceWait: 2000,
    debounceMaxWait: 10000,
  };

  private readonly doDb: DocSyncDb;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.doDb = drizzle(ctx.storage, { schema: docSyncSchema });

    ctx.blockConcurrencyWhile(async () => {
      await migrate(this.doDb, docSyncMigrations);
    });
  }

  private get d1Db() {
    return createDb(this.env.DB);
  }

  onClose(connection: Connection, code: number, reason: string, wasClean: boolean) {
    setLevel(this.env.LOG_LEVEL);
    log.debug("connection_closed", { pageId: this.name });
    // After hibernation wake-up, awareness state is empty (in-memory only).
    // Ensure stub entries exist so removeAwarenessStates in super.onClose
    // can find them, triggering the broadcast to remaining clients.
    const ids = getAwarenessIds(connection);
    const awareness = this.document.awareness;
    for (const id of ids) {
      if (!awareness.states.has(id)) {
        awareness.states.set(id, {});
      }
      if (!awareness.meta.has(id)) {
        awareness.meta.set(id, { clock: Date.now(), lastUpdated: 0 });
      }
    }
    super.onClose(connection, code, reason, wasClean);
  }

  getConnectionTags(connection: Connection, ctx: ConnectionContext): string[] {
    const url = new URL(ctx.request.url);
    const tags: string[] = [];
    if (url.searchParams.get("readOnly") === "1") {
      log.debug("connection_readonly", { pageId: this.name });
      tags.push(READONLY_TAG);
    }
    if (url.searchParams.get("authType") === "member_edit") {
      tags.push(MEMBER_EDIT_TAG);
    }
    return tags;
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const isMemberEdit = connection.tags.includes(MEMBER_EDIT_TAG);

    // Member-edit connections are guaranteed — only cap headroom connections
    if (!isMemberEdit) {
      let total = 0;
      let memberEditCount = 0;
      for (const conn of this.getConnections()) {
        total++;
        if (conn.tags.includes(MEMBER_EDIT_TAG)) memberEditCount++;
      }
      const headroomCount = total - memberEditCount;
      log.debug("connection_attempt", { pageId: this.name, total, headroomCount, isMemberEdit });
      if (headroomCount >= MAX_CONNECTIONS_PER_DOC) {
        log.info("connection_rejected", { pageId: this.name, reason: "headroom_full", headroomCount });
        connection.close(4029, "Too many concurrent connections");
        return;
      }
    }

    return super.onConnect(connection, ctx);
  }

  /** y-partyserver calls this in readSyncMessage to gate syncStep2/update. */
  isReadOnly(connection: Connection): boolean {
    return connection.tags.includes(READONLY_TAG);
  }

  async onCustomMessage(connection: Connection, message: string): Promise<void> {
    const msg = parseDocMessage(message);
    if (!msg || msg.type !== "page-metadata-refresh") return;

    // Don't allow readonly connections to trigger D1 reads
    if (connection.tags.includes(READONLY_TAG)) return;

    try {
      const row = await this.d1Db
        .select({ icon: pages.icon, cover_url: pages.cover_url })
        .from(pages)
        .where(eq(pages.id, this.name))
        .get();
      if (!row) return;

      this.broadcastCustomMessage(
        JSON.stringify({
          type: "page-metadata-updated",
          pageId: this.name,
          icon: row.icon,
          cover_url: row.cover_url,
        }),
        connection,
      );
    } catch (e) {
      log.error("metadata_refresh_failed", errorContext(e));
    }
  }

  async onLoad(): Promise<Y.Doc | void> {
    setLevel(this.env.LOG_LEVEL);

    const chunkRows = await this.doDb
      .select({ chunk_index: docSyncSchema.snapshotChunks.chunk_index, data: docSyncSchema.snapshotChunks.data })
      .from(docSyncSchema.snapshotChunks)
      .orderBy(docSyncSchema.snapshotChunks.chunk_index);

    const state = reassembleChunks(chunkRows);
    log.debug("snapshot_loaded", { pageId: this.name, hasSnapshot: !!state });

    if (state) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, state);
      return doc;
    }
  }

  async onSave(): Promise<void> {
    const state = Y.encodeStateAsUpdate(this.document);
    const dl = log.child({ pageId: this.name });

    const chunks = chunkBuffer(state, CHUNK_SIZE);
    const now = new Date().toISOString();

    // Persist to DO-local SQLite in a single transaction
    try {
      this.doDb.transaction((tx) => {
        tx.delete(docSyncSchema.snapshotChunks).run();
        for (let i = 0; i < chunks.length; i++) {
          tx.insert(docSyncSchema.snapshotChunks).values({ chunk_index: i, data: chunks[i] }).run();
        }
        tx.insert(docSyncSchema.snapshotMeta)
          .values({ id: 1, chunk_count: chunks.length, total_bytes: state.byteLength, snapshot_at: now })
          .onConflictDoUpdate({
            target: docSyncSchema.snapshotMeta.id,
            set: { chunk_count: chunks.length, total_bytes: state.byteLength, snapshot_at: now },
          })
          .run();
      });
      dl.debug("snapshot_saved", { sizeBytes: state.byteLength, chunks: chunks.length });
    } catch (e) {
      dl.error("snapshot_save_failed", errorContext(e));
    }

    // Sync title to D1 (metadata stays authoritative in D1)
    const title = this.document.getText(YJS_PAGE_TITLE).toString() || DEFAULT_PAGE_TITLE;
    try {
      await this.d1Db.update(pages).set({ title, updated_at: now }).where(eq(pages.id, this.name));
    } catch (e) {
      dl.error("title_sync_failed", errorContext(e));
    }

    // FTS indexing must not break snapshot persistence (spec S7)
    try {
      await this.env.SEARCH_QUEUE.send({ type: "index-page", pageId: this.name });
    } catch (e) {
      dl.error("queue_send_failed", errorContext(e));
    }
  }

  /**
   * RPC method for Worker to extract indexable text from the persisted snapshot.
   * Does NOT use this.document or this.name (RPC bypasses partyserver init).
   */
  async getIndexPayload(
    pageId: string,
  ): Promise<{ kind: "found"; title: string; bodyText: string } | { kind: "missing" }> {
    const chunkRows = await this.doDb
      .select({ chunk_index: docSyncSchema.snapshotChunks.chunk_index, data: docSyncSchema.snapshotChunks.data })
      .from(docSyncSchema.snapshotChunks)
      .orderBy(docSyncSchema.snapshotChunks.chunk_index);

    const state = reassembleChunks(chunkRows);
    if (!state) {
      log.debug("index_payload_missing", { pageId });
      return { kind: "missing" };
    }

    const ydoc = new Y.Doc();
    try {
      Y.applyUpdate(ydoc, state);
      const { title, bodyText } = extractPlaintext(ydoc);
      return { kind: "found", title, bodyText };
    } finally {
      ydoc.destroy();
    }
  }
}
