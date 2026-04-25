import { describe, expect, it } from "vitest";
import { apiRequest } from "@tests/worker/helpers/request";

describe("GET /api/v1/health", () => {
  it("returns status ok with a timestamp", async () => {
    const res = await apiRequest("/api/v1/health");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
