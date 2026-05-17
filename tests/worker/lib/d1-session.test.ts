import { describe, expect, it, vi } from "vitest";

import { createSessionDb, selectHttpSessionConstraint } from "@/worker/db/d1/client";

describe("D1 session helpers", () => {
  it("selects latency-focused reads when no bookmark is provided", () => {
    expect(selectHttpSessionConstraint("GET")).toBe("first-unconstrained");
    expect(selectHttpSessionConstraint("HEAD")).toBe("first-unconstrained");
    expect(selectHttpSessionConstraint("GET", "   ")).toBe("first-unconstrained");
  });

  it("selects the caller bookmark for read requests when present", () => {
    expect(selectHttpSessionConstraint("GET", "bookmark-123")).toBe("bookmark-123");
    expect(selectHttpSessionConstraint("HEAD", " bookmark-123 ")).toBe("bookmark-123");
  });

  it("selects primary for mutating requests even when a bookmark is present", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(selectHttpSessionConstraint(method, "bookmark-123")).toBe("first-primary");
    }
  });

  it("creates a Drizzle DB from a D1 session", () => {
    const session = {
      prepare: vi.fn(),
      batch: vi.fn(),
      getBookmark: vi.fn(),
    } as unknown as D1DatabaseSession;
    const d1 = {
      withSession: vi.fn(() => session),
    } as unknown as D1Database;

    const result = createSessionDb(d1, "first-unconstrained");

    expect(d1.withSession).toHaveBeenCalledWith("first-unconstrained");
    expect(result.session).toBe(session);
    expect(result.db.$client).toBe(session);
  });
});
