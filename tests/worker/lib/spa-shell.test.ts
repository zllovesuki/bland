import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicClientConfigScript, renderSpaShell } from "@/worker/lib/spa-shell";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createPublicClientConfigScript", () => {
  it("escapes unsafe html sequences inside the injected JSON", () => {
    const script = createPublicClientConfigScript({
      TURNSTILE_SITE_KEY: "turnstile-test-key",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1?x=</script><script>alert(1)</script>",
    } as Pick<Env, "TURNSTILE_SITE_KEY" | "SENTRY_DSN">);

    expect(script).toContain("window.__BLAND_PUBLIC_CONFIG__=");
    expect(script).toContain("\\u003c/script>\\u003cscript>alert(1)\\u003c/script>");
    expect(script).not.toContain("</script><script>");
  });
});

describe("renderSpaShell", () => {
  it("fetches /index.html from assets and injects bootstrap config into the head", async () => {
    const assetFetch = vi.fn().mockResolvedValue(
      new Response('<!doctype html><html><head><title>bland</title></head><body><div id="root"></div></body></html>', {
        headers: { "Content-Type": "text/html" },
      }),
    );

    let selector: string | null = null;

    class FakeHTMLRewriter {
      private handler: {
        element: (element: { append: (html: string, opts?: { html: boolean }) => void }) => void;
      } | null = null;

      on(nextSelector: string, nextHandler: typeof this.handler) {
        selector = nextSelector;
        this.handler = nextHandler;
        return this;
      }

      async transform(response: Response) {
        const html = await response.text();
        let injected = "";

        this.handler?.element({
          append(nextHtml) {
            injected = nextHtml;
          },
        });

        return new Response(html.replace("</head>", `${injected}</head>`), {
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
    expect(selector).toBe("head");
    const html = await response.text();
    expect(html).toContain("window.__BLAND_PUBLIC_CONFIG__=");
    expect(html).toContain("turnstile-test-key");
  });
});
