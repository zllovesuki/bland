import "fake-indexeddb/auto";
import { createDb, type BlandDatabase } from "@/client/stores/db/bland-db";

let counter = 0;

/**
 * Create a fresh Dexie database with a unique name per test so parallel
 * test cases do not share IndexedDB state. Returns the db handle; the
 * caller is responsible for calling `deleteDb(db)` in `afterEach` so the
 * fake-indexeddb instance does not accumulate.
 */
export function createFreshDb(): BlandDatabase {
  counter += 1;
  return createDb(`bland-test-${process.pid}-${Date.now()}-${counter}`);
}

export async function deleteDb(db: BlandDatabase): Promise<void> {
  if (db.isOpen()) db.close();
  await db.delete();
}
