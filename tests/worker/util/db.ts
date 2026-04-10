import { vi } from "vitest";

import type { Db } from "@/worker/db/d1/client";

type TestQueryRow = Record<string, unknown>;
type TestQueryResult = TestQueryRow[];
type TestDbAll = (query: Parameters<Db["all"]>[0]) => ReturnType<Db["all"]>;

export function createDbMock(...responses: TestQueryResult[]): Db {
  const pendingResponses = [...responses];
  const all = vi.fn<TestDbAll>().mockImplementation(() => {
    const next = pendingResponses.shift() ?? [];
    return Promise.resolve(next) as unknown as ReturnType<Db["all"]>;
  });
  return { all } as Pick<Db, "all"> as Db;
}
