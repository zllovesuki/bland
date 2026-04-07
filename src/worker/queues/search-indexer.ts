import * as Y from "yjs";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@/worker/db/client";
import { docSnapshots, pages } from "@/worker/db/schema";
import { createLogger } from "@/worker/lib/logger";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";
import { YJS_PAGE_TITLE, YJS_DOCUMENT_STORE } from "@/shared/constants";

const log = createLogger("search-indexer");

interface IndexPageMessage {
  type: "index-page";
  pageId: string;
}

function extractPlaintext(ydoc: Y.Doc): { title: string; bodyText: string } {
  const title = ydoc.getText(YJS_PAGE_TITLE).toString();

  const fragment = ydoc.getXmlFragment(YJS_DOCUMENT_STORE);
  const parts: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;

    // XmlText: extract text content
    if (node instanceof Y.XmlText) {
      const text = node.toString();
      if (text.trim()) parts.push(text.trim());
      return;
    }

    // XmlElement: recurse into children, skip embeds
    if (node instanceof Y.XmlElement) {
      const blockType = node.getAttribute("blockType");
      if (blockType === "embed") return;

      for (let i = 0; i < node.length; i++) {
        walk(node.get(i));
      }
      return;
    }

    // XmlFragment: recurse into children
    if (node instanceof Y.XmlFragment) {
      const frag = node;
      for (let i = 0; i < frag.length; i++) {
        walk(frag.get(i));
      }
    }
  }

  walk(fragment);

  return { title, bodyText: parts.join(" ") };
}

export async function handleSearchIndexMessage(msg: IndexPageMessage, env: Env): Promise<void> {
  const { pageId } = msg;
  const db = createDb(env.DB);

  // Check if page is archived — if so, remove from FTS
  const page = await db.select({ archived_at: pages.archived_at }).from(pages).where(eq(pages.id, pageId)).get();

  if (!page || page.archived_at) {
    await db.run(sql`DELETE FROM pages_fts WHERE page_id = ${pageId}`);
    log.info("fts_removed", { pageId, reason: page ? "archived" : "deleted" });
    return;
  }

  // Load snapshot
  const snapshot = await db
    .select({ yjsState: docSnapshots.yjs_state })
    .from(docSnapshots)
    .where(eq(docSnapshots.page_id, pageId))
    .get();

  let title: string;
  let bodyText: string;

  if (snapshot?.yjsState) {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, snapshot.yjsState);
    const extracted = extractPlaintext(ydoc);
    title = extracted.title;
    bodyText = extracted.bodyText;
    ydoc.destroy();
  } else {
    // No snapshot yet — index by page title from D1
    const pageRow = await db.select({ title: pages.title }).from(pages).where(eq(pages.id, pageId)).get();
    title = pageRow?.title ?? "";
    bodyText = "";
  }

  // Normalize empty title to match UI display
  const indexTitle = title.trim() || DEFAULT_PAGE_TITLE;

  // Idempotent: delete then insert (FTS5 doesn't support REPLACE INTO)
  await db.run(sql`DELETE FROM pages_fts WHERE page_id = ${pageId}`);
  await db.run(sql`INSERT INTO pages_fts (page_id, title, body_text) VALUES (${pageId}, ${indexTitle}, ${bodyText})`);

  log.info("fts_indexed", { pageId, titleLen: indexTitle.length, bodyLen: bodyText.length });
}
