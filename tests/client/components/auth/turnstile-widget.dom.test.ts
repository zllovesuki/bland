import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

beforeEach(() => {
  document.head.querySelectorAll("script").forEach((el) => el.remove());
  vi.resetModules();
});

afterEach(() => {
  delete window.__BLAND_CSP_NONCE__;
  document.head.querySelectorAll("script").forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("loadTurnstileScript", () => {
  it("copies the Worker bootstrap nonce onto the appended script element", async () => {
    window.__BLAND_CSP_NONCE__ = "nonce-test";

    const { loadTurnstileScript } = await import("@/client/components/auth/turnstile-widget");

    const loadPromise = loadTurnstileScript();

    const script = document.head.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    expect(script).not.toBeNull();
    expect(script!.async).toBe(true);
    expect(script!.nonce).toBe("nonce-test");

    script!.onload?.(new Event("load"));
    await loadPromise;
  });
});
