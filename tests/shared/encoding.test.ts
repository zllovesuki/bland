import { describe, expect, it } from "vitest";
import { base64UrlDecode, base64UrlEncode } from "@/lib/encoding";

describe("base64UrlEncode", () => {
  it("produces URL-safe alphabet with no padding", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0x00, 0xfa]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("round-trips arbitrary byte sequences", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(33));
    const decoded = base64UrlDecode(base64UrlEncode(bytes));
    expect(decoded).toEqual(bytes);
  });

  it("round-trips empty input", () => {
    const encoded = base64UrlEncode(new Uint8Array());
    expect(encoded).toBe("");
    expect(base64UrlDecode("")).toEqual(new Uint8Array());
  });
});

describe("base64UrlDecode", () => {
  it("accepts inputs across every modulo-4 length", () => {
    for (const len of [1, 2, 3, 4, 5]) {
      const bytes = crypto.getRandomValues(new Uint8Array(len));
      expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
    }
  });
});
