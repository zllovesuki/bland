import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { drizzle } from "drizzle-orm/durable-sqlite";
import * as Y from "yjs";
import * as docSyncSchema from "@/worker/db/docsync-do/schema";
import { YJS_DOCUMENT_STORE, YJS_PAGE_TITLE } from "@/shared/constants";

const CHUNK_SIZE = 32 * 1024;

export async function runInDocSync<R>(
  pageId: string,
  fn: (instance: unknown, state: DurableObjectState) => R | Promise<R>,
): Promise<R> {
  const stub = env.DocSync.getByName(pageId);
  return runInDurableObject(stub, fn);
}

export async function runInWorkspaceIndexer<R>(
  workspaceId: string,
  fn: (instance: unknown, state: DurableObjectState) => R | Promise<R>,
): Promise<R> {
  const stub = env.WorkspaceIndexer.getByName(workspaceId);
  return runInDurableObject(stub, fn);
}

function chunkBuffer(buffer: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < buffer.byteLength; i += size) {
    chunks.push(buffer.slice(i, Math.min(i + size, buffer.byteLength)));
  }
  return chunks;
}

/**
 * Builds a Yjs update payload with a title text and one paragraph of body
 * text in the shape that `extractPlaintext` walks (title in the shared
 * `YJS_PAGE_TITLE` Y.Text, body as a `paragraph` `Y.XmlElement` containing
 * a `Y.XmlText` inside the `YJS_DOCUMENT_STORE` fragment).
 */
export function buildYjsDocBytes(title: string, bodyText: string): Uint8Array {
  const doc = new Y.Doc();
  try {
    if (title) {
      doc.getText(YJS_PAGE_TITLE).insert(0, title);
    }
    if (bodyText) {
      const fragment = doc.getXmlFragment(YJS_DOCUMENT_STORE);
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText(bodyText)]);
      fragment.insert(0, [paragraph]);
    }
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

/**
 * Writes persisted Yjs snapshot bytes directly into the DocSync DO-local
 * SQLite via `runInDurableObject`. The rows (`snapshot_chunks` +
 * `snapshot_meta`) and the 32 KiB chunking match what `DocSync.onSave`
 * writes, so `getSnapshotResponse` / `getIndexPayload` read them back the
 * same way whether the bytes came from a live client session or this
 * helper.
 */
export async function seedDocSyncSnapshot(pageId: string, bytes: Uint8Array): Promise<void> {
  await runInDocSync(pageId, (_instance, state) => {
    const doDb = drizzle(state.storage, { schema: docSyncSchema });
    const chunks = chunkBuffer(bytes, CHUNK_SIZE);
    const now = new Date().toISOString();
    doDb.transaction((tx) => {
      tx.delete(docSyncSchema.snapshotChunks).run();
      for (let i = 0; i < chunks.length; i++) {
        tx.insert(docSyncSchema.snapshotChunks).values({ chunk_index: i, data: chunks[i] }).run();
      }
      tx.insert(docSyncSchema.snapshotMeta)
        .values({ id: 1, chunk_count: chunks.length, total_bytes: bytes.byteLength, snapshot_at: now })
        .onConflictDoUpdate({
          target: docSyncSchema.snapshotMeta.id,
          set: { chunk_count: chunks.length, total_bytes: bytes.byteLength, snapshot_at: now },
        })
        .run();
    });
  });
}
