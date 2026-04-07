import { vi } from "vitest";

import type { Db } from "@/worker/db/client";

export function createDbMock(...responses: unknown[]): Db {
  const all = vi.fn();
  for (const response of responses) {
    all.mockResolvedValueOnce(response);
  }
  return { all } as unknown as Db;
}
