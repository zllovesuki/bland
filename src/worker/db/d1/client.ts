import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema";

export type D1SessionInput = D1SessionConstraint | string;
export type D1Client = D1Database | D1DatabaseSession;
export type Db = DrizzleD1Database<typeof schema> & { $client: D1Client };

export function createDb(d1: D1Client): Db {
  return drizzle(d1 as D1Database, { schema }) as Db;
}

export function createSessionDb(
  d1: D1Database,
  constraintOrBookmark: D1SessionInput,
): { db: Db; session: D1DatabaseSession } {
  const session = d1.withSession(constraintOrBookmark);
  return { db: createDb(session), session };
}

export function selectHttpSessionConstraint(method: string, bookmark?: string | null): D1SessionInput {
  switch (method.toUpperCase()) {
    case "POST":
    case "PATCH":
    case "PUT":
    case "DELETE":
      return "first-primary";
    default:
      return bookmark?.trim() || "first-unconstrained";
  }
}
