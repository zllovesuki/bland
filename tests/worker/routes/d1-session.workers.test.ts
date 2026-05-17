import { beforeEach, describe, expect, it } from "vitest";

import { D1_BOOKMARK_HEADER } from "@/shared/bookmark";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedUser } from "@tests/worker/helpers/seeds";

describe("API D1 sessions", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns a bookmark for D1-backed GET requests without an inbound bookmark", async () => {
    const user = await seedUser();

    const res = await apiRequest("/api/v1/auth/me", { userId: user.id });

    expect(res.status).toBe(200);
    expect(res.headers.get(D1_BOOKMARK_HEADER)).toMatch(/\S/);
  });
});
