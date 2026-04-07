import { YServer } from "y-partyserver";
import type { Connection, ConnectionContext } from "partyserver";
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { createDb } from "@/worker/db/client";
import { docSnapshots, pages } from "@/worker/db/schema";
import { createLogger, errorContext, setLevel } from "@/worker/lib/logger";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";
import { YJS_PAGE_TITLE } from "@/shared/constants";

const MAX_CONNECTIONS_PER_DOC = 20;
const log = createLogger("doc-sync");

const READONLY_TAG = "readonly";
const MEMBER_EDIT_TAG = "member_edit";

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

export class DocSync extends YServer<Env> {
  static options = { hibernate: true };

  static callbackOptions = {
    debounceWait: 2000,
    debounceMaxWait: 10000,
  };

  private get db() {
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

  async onLoad(): Promise<Y.Doc | void> {
    setLevel(this.env.LOG_LEVEL);
    const row = await this.db
      .select({ yjsState: docSnapshots.yjs_state })
      .from(docSnapshots)
      .where(eq(docSnapshots.page_id, this.name))
      .get();

    log.debug("snapshot_loaded", { pageId: this.name, hasSnapshot: !!row?.yjsState });

    if (row?.yjsState) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, row.yjsState);
      return doc;
    }
  }

  async onSave(): Promise<void> {
    const state = Y.encodeStateAsUpdate(this.document);

    const dl = log.child({ pageId: this.name });

    // D1 BLOB limit is 2MB — warn if approaching
    const WARN_THRESHOLD = 1.5 * 1024 * 1024;
    if (state.byteLength > WARN_THRESHOLD) {
      dl.warn("snapshot_size_warning", { sizeBytes: state.byteLength });
    }

    const title = this.document.getText(YJS_PAGE_TITLE).toString() || DEFAULT_PAGE_TITLE;
    const now = new Date().toISOString();

    try {
      await this.db.batch([
        this.db
          .insert(docSnapshots)
          .values({ page_id: this.name, yjs_state: state, snapshot_at: now })
          .onConflictDoUpdate({
            target: docSnapshots.page_id,
            set: { yjs_state: state, snapshot_at: now },
          }),
        this.db.update(pages).set({ title, updated_at: now }).where(eq(pages.id, this.name)),
      ]);
      dl.debug("snapshot_saved", { sizeBytes: state.byteLength });
    } catch (e) {
      dl.error("snapshot_save_failed", errorContext(e));
    }

    // FTS indexing must not break snapshot persistence (spec §7)
    try {
      await this.env.SEARCH_QUEUE.send({ type: "index-page", pageId: this.name });
    } catch (e) {
      dl.error("queue_send_failed", errorContext(e));
    }
  }
}
