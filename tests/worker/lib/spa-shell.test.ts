import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicClientConfigScript, renderSpaShell, resetShellHintsCacheForTests } from "@/worker/lib/spa-shell";

afterEach(() => {
  resetShellHintsCacheForTests();
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
  it("injects bootstrap config, applies one nonce to all scripts, and appends shell hint link headers", async () => {
    const html =
      '<!doctype html><html><head><title>bland</title></head><body><div id="root"></div><script>console.log("inline")</script><script type="module" src="/src/client/main.tsx"></script></body></html>';
    const assetFetch = vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === "/index.html") {
        return new Response(
          `<!doctype html><html><head><title>bland</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="modulepreload" crossorigin href="/assets/index-123.js"><link rel="stylesheet" crossorigin href="/assets/index-456.css"></head><body><div id="root"></div></body></html>`,
          {
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    });

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

        const parseAttributes = (tagMarkup: string) => {
          const attrs = new Map<string, string>();
          const attributePattern = /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
          for (const match of tagMarkup.matchAll(attributePattern)) {
            const name = match[1]?.toLowerCase();
            if (!name) continue;
            attrs.set(name, match[2] ?? match[3] ?? match[4] ?? "");
          }
          return attrs;
        };

        this.handlers.get("head")?.element({
          append(nextHtml: string) {
            injected = nextHtml;
          },
        });

        for (const match of html.matchAll(/<(script|link)\b([^>]*?)>/gi)) {
          const tagName = match[1]?.toLowerCase();
          const attributes = parseAttributes(match[2] ?? "");
          if (!tagName) continue;

          this.handlers.get(tagName)?.element({
            tagName,
            getAttribute(name: string) {
              return attributes.get(name) ?? null;
            },
            hasAttribute(name: string) {
              return attributes.has(name);
            },
            setAttribute(name: string, value: string) {
              if (tagName === "script" && name === "nonce") {
                scriptNonce = value;
              }
              attributes.set(name, value);
            },
          });
        }

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

    expect(assetFetch).toHaveBeenCalledTimes(2);
    expect((assetFetch.mock.calls[0]?.[0] as Request).url).toBe("https://bland.tools/acme/page-1");
    expect((assetFetch.mock.calls[1]?.[0] as Request).url).toBe("https://bland.tools/index.html");
    const responseHtml = await response.text();
    expect(responseHtml).toContain("window.__BLAND_PUBLIC_CONFIG__=");
    expect(responseHtml).toContain("window.__BLAND_CSP_NONCE__=");
    expect(responseHtml).toContain("turnstile-test-key");
    const nonceMatches = [...responseHtml.matchAll(/nonce=\"([^\"]+)\"/g)].map((match) => match[1]);
    expect(new Set(nonceMatches).size).toBe(1);
    expect(nonceMatches.length).toBeGreaterThanOrEqual(3);
    expect(response.headers.get("Content-Security-Policy")).toContain(`'nonce-${nonceMatches[0]}'`);
    expect(response.headers.get("Link")).toContain("<https://fonts.googleapis.com>; rel=preconnect");
    expect(response.headers.get("Link")).toContain("</assets/index-123.js>; rel=preload; as=script; crossorigin");
    expect(response.headers.get("Link")).toContain("</assets/index-456.css>; rel=preload; as=style; crossorigin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
