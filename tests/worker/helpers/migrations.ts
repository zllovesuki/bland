import d1MigrationJournal from "../../../drizzle/d1/meta/_journal.json";
import type { D1Migration } from "cloudflare:test";

const d1MigrationFiles = import.meta.glob("../../../drizzle/d1/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface JournalEntry {
  tag: string;
}

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
}

export function readAppD1Migrations(): D1Migration[] {
  return (d1MigrationJournal.entries as JournalEntry[]).map((entry) => {
    const fileName = `${entry.tag}.sql`;
    const filePath = `../../../drizzle/d1/${fileName}`;
    const sql = d1MigrationFiles[filePath];
    if (!sql) {
      throw new Error(
        `Missing D1 migration file for ${fileName}. Known files: ${Object.keys(d1MigrationFiles).join(", ")}`,
      );
    }
    return { name: fileName, queries: splitStatements(sql) };
  });
}
