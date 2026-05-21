import { describe, expect, it } from "vitest";

import { generateSecureToken } from "@/worker/lib/auth";

describe("generateSecureToken", () => {
  it("returns URL-safe random tokens", () => {
    const first = generateSecureToken();
    const second = generateSecureToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });
});
