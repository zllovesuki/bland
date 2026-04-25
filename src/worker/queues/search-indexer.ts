import { eq } from "drizzle-orm";
import { createDb } from "@/worker/db/d1/client";
import { pages } from "@/worker/db/d1/schema";
import { createLogger } from "@/worker/lib/logger";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";

const log = createLogger("search-indexer");

interface IndexPageMessage {
  type: "index-page";
  pageId: string;
}

export type SearchIndexResult = { kind: "ok" } | { kind: "retry"; delaySeconds: number; reason: string };

export async function handleSearchIndexMessage(msg: IndexPageMessage, env: Env): Promise<SearchIndexResult> {
  const { pageId } = msg;
  const db = createDb(env.DB);

  // Load page metadata from D1 (workspace_id for routing, archived_at for removal, kind for extraction)
  const page = await db
    .select({
      workspace_id: pages.workspace_id,
      archived_at: pages.archived_at,
      title: pages.title,
      kind: pages.kind,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .get();

  // Page not visible yet from D1: most often the queue consumer raced ahead
  // of the producer's bookmark. Retry so create-immediately-search works.
  if (!page) {
    log.info("fts_retry", { pageId, reason: "page_not_yet_visible" });
    return { kind: "retry", delaySeconds: 2, reason: "page_not_yet_visible" };
  }

  const indexer = env.WorkspaceIndexer.getByName(page.workspace_id);

  // Archived or deleted — remove from search index
  if (page.archived_at) {
    await indexer.removePage(pageId);
    log.info("fts_removed", { pageId, reason: "archived" });
    return { kind: "ok" };
  }

  // Fetch indexable text from DocSync DO
  const doc = env.DocSync.getByName(pageId);
  const payload = await doc.getIndexPayload(pageId, page.kind);

  let title: string;
  let bodyText: string;

  if (payload.kind === "found") {
    title = payload.title;
    bodyText = payload.bodyText;
  } else {
    // No snapshot yet — index by page title from D1
    title = page.title?.trim() || DEFAULT_PAGE_TITLE;
    bodyText = "";
  }

  const result = await indexer.indexPage(pageId, title, bodyText);
  if (result.kind === "error") {
    throw new Error(`WorkspaceIndexer.indexPage failed for ${pageId}: ${result.message}`);
  }
  log.info("fts_indexed", { pageId, titleLen: title.length, bodyLen: bodyText.length });
  return { kind: "ok" };
}
