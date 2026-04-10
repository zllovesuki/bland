import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  schema: "./src/worker/db/docsync-do/schema.ts",
  out: "./drizzle/docsync-do",
  strict: true,
  verbose: true,
});
