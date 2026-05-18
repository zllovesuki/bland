import { describe, expect, it } from "vitest";
import { buildSitePagePath, buildSitePublicUrl } from "@/worker/lib/site-public-url";

const baseSite = { slug: "acme", published_at: "2025-01-01T00:00:00Z", home_page_id: null };

describe("buildSitePublicUrl", () => {
  it("returns null when the site is not published", () => {
    expect(
      buildSitePublicUrl({ ...baseSite, published_at: null }, "bland.site", "P1", "Hello", new URL("https://app/")),
    ).toBeNull();
  });

  it("returns null when no base domain is configured", () => {
    expect(buildSitePublicUrl(baseSite, null, "P1", "Hello", new URL("https://app/"))).toBeNull();
  });

  it("uses https + no port for production domains", () => {
    expect(buildSitePublicUrl(baseSite, "bland.site", "P1", "Hello World", new URL("https://app.example/"))).toBe(
      "https://acme.bland.site/hello-world-p1",
    );
  });

  it("normalizes the home page to '/' for production", () => {
    expect(
      buildSitePublicUrl({ ...baseSite, home_page_id: "P1" }, "bland.site", "P1", "Home", new URL("https://app/")),
    ).toBe("https://acme.bland.site/");
  });

  it("falls back to 'untitled' when the page title slugifies to empty", () => {
    expect(buildSitePublicUrl(baseSite, "bland.site", "P1", "   ", new URL("https://app/"))).toBe(
      "https://acme.bland.site/untitled-p1",
    );
  });

  it("derives protocol + port from the request when the base domain is *.localhost", () => {
    expect(
      buildSitePublicUrl(baseSite, "bland.localhost", "P1", "Hi There", new URL("http://app.localhost:5173/x")),
    ).toBe("http://acme.bland.localhost:5173/hi-there-p1");
  });

  it("treats the bare 'localhost' base domain as local-dev too", () => {
    expect(buildSitePublicUrl(baseSite, "localhost", "P1", "Hi", new URL("http://app.localhost:5173/"))).toBe(
      "http://acme.localhost:5173/hi-p1",
    );
  });

  it("omits the port when the request URL itself has none", () => {
    expect(buildSitePublicUrl(baseSite, "bland.localhost", "P1", "Hi", new URL("http://app.localhost/"))).toBe(
      "http://acme.bland.localhost/hi-p1",
    );
  });

  it("builds visible page paths with lowercase page IDs", () => {
    expect(buildSitePagePath("ABC123", "Hello World")).toBe("/hello-world-abc123");
  });
});
