import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Type-safe query shim for the pages_fts FTS5 virtual table.
//
// The actual table is created by a hand-written migration (drizzle/0001_fts5_pages.sql),
// NOT by drizzle-kit. This file is intentionally outside the drizzle.config.ts schema
// path so drizzle-kit never tries to diff or generate migrations for it.
//
// If Drizzle adds native FTS5 support in the future:
//   1. Add a reconciliation migration to drop/rename the manually-managed table
//   2. Move the definition into schema.ts using the native API
//   3. Rebuild the index from doc_snapshots (it's a derived projection)
//
// Do not declare PKs, uniques, or indexes here — the FTS5 virtual table does not have them.

export const pagesFts = sqliteTable("pages_fts", {
  page_id: text("page_id").notNull(),
  title: text("title").notNull(),
  body_text: text("body_text").notNull(),
});
