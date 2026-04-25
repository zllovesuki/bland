import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { createPublicClientConfigScript, renderSpaShell, resetShellHintsCacheForTests } from "@/worker/lib/spa-shell";

afterEach(() => {
  resetShellHintsCacheForTests();
});

describe("createPublicClientConfigScript", () => {
  it("escapes unsafe html sequences inside the injected JSON", () => {
    const script = createPublicClientConfigScript(
      {
        TURNSTILE_SITE_KEY: "turnstile-test-key",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1?x=</script><script>alert(1)</script>",
      } as Pick<Env, "TURNSTILE_SITE_KEY" | "SENTRY_DSN">,
      "nonce-test",
    );

    expect(script).toContain("window.__BLAND_PUBLIC_CONFIG__=");
    expect(script).toContain('window.__BLAND_CSP_NONCE__="nonce-test";');
    expect(script).toContain("\\u003c/script>\\u003cscript>alert(1)\\u003c/script>");
    expect(script).not.toContain("</script><script>");
  });
});

describe("renderSpaShell", () => {
  it("injects bootstrap config, applies one nonce to all scripts, and appends shell hint link headers", async () => {
    const response = await renderSpaShell(
      new Request("https://bland.tools/acme/page-1"),
      env as Pick<Env, "ASSETS" | "TURNSTILE_SITE_KEY" | "SENTRY_DSN">,
    );

    const responseHtml = await response.text();
    expect(responseHtml).toContain("window.__BLAND_PUBLIC_CONFIG__=");
    expect(responseHtml).toContain("window.__BLAND_CSP_NONCE__=");
    expect(responseHtml).toContain(env.TURNSTILE_SITE_KEY);

    const nonceMatches = [...responseHtml.matchAll(/nonce="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(nonceMatches).size).toBe(1);
    expect(nonceMatches.length).toBeGreaterThanOrEqual(3);
    expect(response.headers.get("Content-Security-Policy")).toContain(`'nonce-${nonceMatches[0]}'`);
    expect(response.headers.get("Link")).toContain("</assets/index-test.js>; rel=preload; as=script; crossorigin");
    expect(response.headers.get("Link")).toContain("</assets/index-test.css>; rel=preload; as=style; crossorigin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
