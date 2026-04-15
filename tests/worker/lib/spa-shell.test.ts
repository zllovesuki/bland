import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicClientConfigScript, renderSpaShell } from "@/worker/lib/spa-shell";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  it("fetches /index.html from assets, injects bootstrap config, and applies one nonce to all scripts", async () => {
    const assetFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '<!doctype html><html><head><title>bland</title></head><body><div id="root"></div><script>console.log("inline")</script><script type="module" src="/src/client/main.tsx"></script></body></html>',
          { headers: { "Content-Type": "text/html" } },
        ),
      );

    class FakeHTMLRewriter {
      private handlers = new Map<string, { element: (element: unknown) => void }>();

      on(nextSelector: string, nextHandler: { element: (element: unknown) => void }) {
        this.handlers.set(nextSelector, nextHandler);
        return this;
      }

      async transform(response: Response) {
        const html = await response.text();
        let injected = "";
        let scriptNonce: string | null = null;

        this.handlers.get("head")?.element({
          append(nextHtml: string) {
            injected = nextHtml;
          },
        });

        this.handlers.get("script")?.element({
          setAttribute(name: string, value: string) {
            if (name === "nonce") {
              scriptNonce = value;
            }
          },
        });

        const withNonce =
          scriptNonce === null
            ? html
            : html.replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/g, `<script nonce="${scriptNonce}"$1>`);

        return new Response(withNonce.replace("</head>", `${injected}</head>`), {
          status: response.status,
          headers: response.headers,
        });
      }
    }

    vi.stubGlobal("HTMLRewriter", FakeHTMLRewriter);

    const response = await renderSpaShell(new Request("https://bland.tools/acme/page-1"), {
      ASSETS: { fetch: assetFetch },
      TURNSTILE_SITE_KEY: "turnstile-test-key",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    } as unknown as Pick<Env, "ASSETS" | "TURNSTILE_SITE_KEY" | "SENTRY_DSN">);

    expect(assetFetch).toHaveBeenCalledTimes(1);
    expect((assetFetch.mock.calls[0]?.[0] as Request).url).toBe("https://bland.tools/acme/page-1");
    const html = await response.text();
    expect(html).toContain("window.__BLAND_PUBLIC_CONFIG__=");
    expect(html).toContain("window.__BLAND_CSP_NONCE__=");
    expect(html).toContain("turnstile-test-key");
    const nonceMatches = [...html.matchAll(/nonce=\"([^\"]+)\"/g)].map((match) => match[1]);
    expect(new Set(nonceMatches).size).toBe(1);
    expect(nonceMatches.length).toBeGreaterThanOrEqual(3);
    expect(response.headers.get("Content-Security-Policy")).toContain(`'nonce-${nonceMatches[0]}'`);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
