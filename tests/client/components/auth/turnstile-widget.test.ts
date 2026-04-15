import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadTurnstileScript", () => {
  it("copies the Worker bootstrap nonce onto the appended script element", async () => {
    const appendedScripts: Array<Record<string, unknown>> = [];
    const script: Record<string, unknown> = {
      async: false,
      nonce: "",
      onload: undefined,
      onerror: undefined,
      src: "",
    };

    vi.stubGlobal("window", { __BLAND_CSP_NONCE__: "nonce-test" });
    vi.stubGlobal("document", {
      createElement(tag: string) {
        expect(tag).toBe("script");
        return script;
      },
      head: {
        appendChild(nextScript: Record<string, unknown>) {
          appendedScripts.push(nextScript);
        },
      },
    });

    const { loadTurnstileScript } = await import("@/client/components/auth/turnstile-widget");

    const loadPromise = loadTurnstileScript();

    expect(script.src).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    expect(script.async).toBe(true);
    expect(script.nonce).toBe("nonce-test");
    expect(appendedScripts).toEqual([script]);

    (script.onload as (() => void) | undefined)?.();
    await loadPromise;
  });
});
