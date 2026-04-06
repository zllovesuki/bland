import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  // Single-file path — only tables in this file are diffed for migration generation.
  // The FTS5 query shim in src/worker/db/fts.ts is intentionally excluded.
  // Do not expand this to a glob (e.g. "./src/worker/db/*.ts") without accounting for fts.ts.
  schema: "./src/worker/db/schema.ts",
  dialect: "sqlite",
});
