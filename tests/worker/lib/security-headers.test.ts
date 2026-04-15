import { describe, expect, it } from "vitest";
import { applyDocumentSecurityHeaders, buildDocumentCsp } from "@/worker/lib/security-headers";

describe("document security headers", () => {
  it("includes the Sentry origin in connect-src when a DSN is configured", () => {
    const csp = buildDocumentCsp({
      nonce: "nonce-test",
      requestUrl: "https://bland.tools/acme/page-1",
      sentryDsn: "https://public@example.ingest.sentry.io/1",
    });

    expect(csp).toContain(
      "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://example.ingest.sentry.io",
    );
    expect(csp).toContain(
      "script-src 'self' 'nonce-nonce-test' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    );
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("omits the Sentry origin when no DSN is configured", () => {
    const csp = buildDocumentCsp({
      nonce: "nonce-test",
      requestUrl: "https://bland.tools/acme/page-1",
      sentryDsn: null,
    });

    expect(csp).not.toContain("ingest.sentry.io");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
  });

  it("relaxes connect-src for localhost without forcing insecure upgrades", () => {
    const csp = buildDocumentCsp({
      nonce: "nonce-test",
      requestUrl: "http://localhost:8787/acme/page-1",
      sentryDsn: null,
    });

    expect(csp).toContain(
      "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com http: https: ws: wss:",
    );
    expect(csp).toContain(
      "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com 'unsafe-inline' 'unsafe-eval'",
    );
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("applies CSP and baseline headers to document responses", async () => {
    const response = applyDocumentSecurityHeaders(new Response("<html></html>"), {
      nonce: "nonce-test",
      requestUrl: "https://bland.tools/acme/page-1",
      sentryDsn: null,
    });

    expect(response.headers.get("Content-Security-Policy")).toContain("'nonce-nonce-test'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("<html></html>");
  });
});
