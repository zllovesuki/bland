import { describe, expect, it } from "vitest";
import { friendlyName } from "@/client/lib/friendly-name";

describe("friendlyName", () => {
  it("is deterministic for a given seed", () => {
    expect(friendlyName("abc-123")).toBe(friendlyName("abc-123"));
  });

  it("produces distinct names for different seeds with high probability", () => {
    const names = new Set<string>();
    for (let i = 0; i < 64; i++) {
      names.add(friendlyName(`seed-${i}`));
    }
    expect(names.size).toBeGreaterThan(32);
  });

  it("returns a two-word capitalized name", () => {
    const name = friendlyName("some-user-id");
    expect(name).toMatch(/^[A-Z][A-Za-z]+ [A-Z][A-Za-z]+$/);
  });

  it("handles empty seed without throwing", () => {
    expect(() => friendlyName("")).not.toThrow();
    expect(friendlyName("")).toMatch(/^[A-Z][A-Za-z]+ [A-Z][A-Za-z]+$/);
  });
});
