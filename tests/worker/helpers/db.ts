import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/worker/db/d1/client";

type D1Binding = typeof env.DB;

export function getDb(session: string | null = "first-primary"): Db {
  const d1: D1Binding | ReturnType<D1Binding["withSession"]> = session ? env.DB.withSession(session) : env.DB;
  return createDb(d1 as unknown as D1Database);
}

export async function resetD1Tables(): Promise<void> {
  const db = getDb();
  await db.run(sql`DELETE FROM uploads`);
  await db.run(sql`DELETE FROM page_shares`);
  await db.run(sql`UPDATE pages SET parent_id = NULL`);
  await db.run(sql`DELETE FROM pages`);
  await db.run(sql`DELETE FROM invites`);
  await db.run(sql`DELETE FROM memberships`);
  await db.run(sql`DELETE FROM workspaces`);
  await db.run(sql`DELETE FROM users`);
}
