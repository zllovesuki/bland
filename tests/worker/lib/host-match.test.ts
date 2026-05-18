import { describe, expect, it } from "vitest";

import { matchSiteHost } from "@/worker/lib/host-match";

const ENABLED = { PUBLISHED_SITE_DOMAIN: "bland.site" };
const DISABLED = { PUBLISHED_SITE_DOMAIN: "" };

function host(url: string): URL {
  return new URL(url);
}

describe("matchSiteHost", () => {
  it("returns none when the feature is disabled", () => {
    expect(matchSiteHost(host("https://acme.bland.site/"), DISABLED)).toEqual({ kind: "none" });
    expect(
      matchSiteHost(host("https://acme.bland.site/"), { PUBLISHED_SITE_DOMAIN: undefined as unknown as string }),
    ).toEqual({
      kind: "none",
    });
  });

  it("matches apex host as apex", () => {
    expect(matchSiteHost(host("https://bland.site/"), ENABLED)).toEqual({ kind: "apex", baseDomain: "bland.site" });
    expect(matchSiteHost(host("https://BLAND.SITE/foo"), ENABLED)).toEqual({ kind: "apex", baseDomain: "bland.site" });
  });

  it("matches single-label subdomain", () => {
    expect(matchSiteHost(host("https://acme.bland.site/"), ENABLED)).toEqual({
      kind: "subdomain",
      slug: "acme",
      baseDomain: "bland.site",
    });
    expect(matchSiteHost(host("https://Acme.Bland.SITE/foo"), ENABLED)).toEqual({
      kind: "subdomain",
      slug: "acme",
      baseDomain: "bland.site",
    });
  });

  it("rejects multi-label subdomains", () => {
    expect(matchSiteHost(host("https://foo.bar.bland.site/"), ENABLED)).toEqual({ kind: "none" });
  });

  it("rejects empty subdomain", () => {
    expect(matchSiteHost(host("https://.bland.site/"), ENABLED)).toEqual({ kind: "none" });
  });

  it("rejects unrelated hosts", () => {
    expect(matchSiteHost(host("https://bland.tools/"), ENABLED)).toEqual({ kind: "none" });
    expect(matchSiteHost(host("https://docs.limic.dev/"), ENABLED)).toEqual({ kind: "none" });
    expect(matchSiteHost(host("https://bland.example/"), ENABLED)).toEqual({ kind: "none" });
    // A host that merely ends with the same letters but lacks the dot must not match.
    expect(matchSiteHost(host("https://evilbland.site/"), ENABLED)).toEqual({ kind: "none" });
  });

  it("works for local dev base domain", () => {
    const local = { PUBLISHED_SITE_DOMAIN: "bland.localhost" };
    expect(matchSiteHost(host("http://bland.localhost:5173/"), local)).toEqual({
      kind: "apex",
      baseDomain: "bland.localhost",
    });
    expect(matchSiteHost(host("http://acme.bland.localhost:5173/"), local)).toEqual({
      kind: "subdomain",
      slug: "acme",
      baseDomain: "bland.localhost",
    });
  });
});
