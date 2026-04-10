import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  schema: "./src/worker/db/workspace-indexer/schema.ts",
  out: "./drizzle/workspace-indexer",
  strict: true,
  verbose: true,
});
