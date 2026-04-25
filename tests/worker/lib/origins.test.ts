import { describe, expect, it } from "vitest";

import { getAllowedOrigins, isAllowedOrigin } from "@/worker/lib/origins";

function createEnv(value?: string): Pick<Env, "ALLOWED_ORIGINS"> {
  return { ALLOWED_ORIGINS: value as Env["ALLOWED_ORIGINS"] };
}

describe("worker origins", () => {
  it("parses, trims, normalizes, and deduplicates configured origins", () => {
    const env = createEnv(
      " https://bland.tools , https://bland.tools/ , http://localhost:5173/ , https://staging.bland.tools ",
    );

    expect(getAllowedOrigins(env)).toEqual([
      "https://bland.tools",
      "http://localhost:5173",
      "https://staging.bland.tools",
    ]);
  });

  it("rejects a missing allowlist", () => {
    expect(() => getAllowedOrigins(createEnv())).toThrow(/ALLOWED_ORIGINS/);
  });

  it("rejects an empty allowlist", () => {
    expect(() => getAllowedOrigins(createEnv(" , "))).toThrow(/ALLOWED_ORIGINS/);
  });

  it("rejects malformed configured origins", () => {
    expect(() => getAllowedOrigins(createEnv("not-a-url"))).toThrow(/ALLOWED_ORIGINS/);
  });

  it("rejects non-http origins", () => {
    expect(() => getAllowedOrigins(createEnv("ftp://bland.tools"))).toThrow(/ALLOWED_ORIGINS/);
  });

  it("allows configured deployed origins", () => {
    const env = createEnv("https://bland.tools,https://staging.bland.tools");

    expect(isAllowedOrigin("https://bland.tools", env)).toBe(true);
    expect(isAllowedOrigin("https://staging.bland.tools", env)).toBe(true);
  });

  it("allows explicitly configured local origins", () => {
    const env = createEnv("http://localhost:5173,http://127.0.0.1:5173");

    expect(isAllowedOrigin("http://localhost:5173", env)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5173", env)).toBe(true);
  });

  it("rejects unlisted local origins", () => {
    const env = createEnv("http://localhost:5173");

    expect(isAllowedOrigin("http://127.0.0.1:5173", env)).toBe(false);
    expect(isAllowedOrigin("http://0.0.0.0:5173", env)).toBe(false);
  });

  it("rejects unrelated and malformed request origins", () => {
    const env = createEnv("https://bland.tools");

    expect(isAllowedOrigin("https://example.com", env)).toBe(false);
    expect(isAllowedOrigin("not-a-url", env)).toBe(false);
    expect(isAllowedOrigin(null, env)).toBe(false);
  });
});
