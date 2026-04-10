import { DurableObject } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as indexerSchema from "@/worker/db/workspace-indexer/schema";
import { createLogger, errorContext } from "@/worker/lib/logger";
import workspaceIndexerMigrations from "../../../drizzle/workspace-indexer/migrations.js";

const log = createLogger("workspace-indexer");

type IndexerDb = DrizzleSqliteDODatabase<typeof indexerSchema>;

export type IndexPageResult = { kind: "indexed" } | { kind: "error"; message: string };
export type RemovePageResult = { kind: "removed" };
export type SearchResult = { kind: "results"; items: { pageId: string; snippet: string }[] };
export type ClearResult = { kind: "cleared" };

export class WorkspaceIndexer extends DurableObject<Env> {
  private readonly db: IndexerDb;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema: indexerSchema });

    ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, workspaceIndexerMigrations);
      // FTS5 virtual tables are not managed by drizzle — create manually
      this.db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
        page_id UNINDEXED,
        title,
        body_text,
        tokenize='trigram'
      )`);
    });
  }

  async indexPage(pageId: string, title: string, bodyText: string): Promise<IndexPageResult> {
    try {
      // FTS5 doesn't support REPLACE INTO — delete then insert in a transaction
      this.db.transaction((tx) => {
        tx.run(sql`DELETE FROM pages_fts WHERE page_id = ${pageId}`);
        tx.run(sql`INSERT INTO pages_fts (page_id, title, body_text) VALUES (${pageId}, ${title}, ${bodyText})`);
      });
      log.debug("page_indexed", { pageId, titleLen: title.length, bodyLen: bodyText.length });
      return { kind: "indexed" };
    } catch (e) {
      log.error("index_page_failed", { pageId, ...errorContext(e) });
      return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  async removePage(pageId: string): Promise<RemovePageResult> {
    try {
      this.db.run(sql`DELETE FROM pages_fts WHERE page_id = ${pageId}`);
      log.debug("page_removed", { pageId });
    } catch (e) {
      log.error("remove_page_failed", { pageId, ...errorContext(e) });
    }
    return { kind: "removed" };
  }

  async search(query: string, limit: number): Promise<SearchResult> {
    try {
      // Double-quote wrapping escapes FTS5 operators in user input
      const escaped = '"' + query.replace(/"/g, '""') + '"';
      const rows = this.db.all<{ page_id: string; snippet: string }>(
        sql`SELECT page_id,
              snippet(pages_fts, 2, '<mark>', '</mark>', '...', 32) as snippet
         FROM pages_fts
         WHERE pages_fts MATCH ${escaped}
         LIMIT ${limit}`,
      );
      return {
        kind: "results",
        items: rows.map((r) => ({ pageId: r.page_id, snippet: r.snippet })),
      };
    } catch (e) {
      log.error("search_failed", { query, ...errorContext(e) });
      return { kind: "results", items: [] };
    }
  }

  async clear(): Promise<ClearResult> {
    try {
      this.db.run(sql`DELETE FROM pages_fts`);
      log.info("index_cleared");
    } catch (e) {
      log.error("clear_failed", errorContext(e));
    }
    return { kind: "cleared" };
  }
}
