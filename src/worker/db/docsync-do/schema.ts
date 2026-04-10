import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sqliteBytes } from "@/worker/db/sqlite";

export const snapshotMeta = sqliteTable("snapshot_meta", {
  id: integer("id").primaryKey(),
  chunk_count: integer("chunk_count").notNull(),
  total_bytes: integer("total_bytes").notNull(),
  snapshot_at: text("snapshot_at").notNull(),
});

export const snapshotChunks = sqliteTable("snapshot_chunks", {
  chunk_index: integer("chunk_index").primaryKey(),
  data: sqliteBytes("data").notNull(),
});
