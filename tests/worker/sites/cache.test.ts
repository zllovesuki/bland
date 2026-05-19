import { describe, expect, it } from "vitest";

import {
  buildSiteHtmlEtag,
  buildSiteCacheKey,
  buildSiteCacheTags,
  createSiteHtmlRevision,
  createRenderDependencyHash,
  getSitesRendererVersion,
  parseSitePmJsonEnvelope,
  siteHtmlEtagMatches,
  type SitePmJsonEnvelope,
} from "@/worker/sites/cache";

const ENVELOPE: SitePmJsonEnvelope = {
  content: { type: "doc", content: [{ type: "paragraph" }] },
  metrics: { words: 0, characters: 0 },
  updatedAt: "2026-05-17T12:00:00.000Z",
};

describe("Sites cache helpers", () => {
  it("drops visitor query params and keys by normalized request path", () => {
    const key = buildSiteCacheKey(new Request("https://acme.sites.test/docs?utm_source=newsletter&fbclid=ignored"));

    const url = new URL(key.url);
    expect(url.origin).toBe("https://acme.sites.test");
    expect(url.pathname).toBe("/docs");
    expect(url.searchParams.get("utm_source")).toBeNull();
    expect(url.searchParams.get("fbclid")).toBeNull();
    expect(key.method).toBe("GET");
  });

  it("builds cache tags for later purge support", () => {
    expect(buildSiteCacheTags({ workspace_id: "ws1" }, { id: "page1", published_root_id: "root1" })).toBe(
      "sites-html,site:ws1,page:page1,root:root1",
    );
  });

  it("uses the configured Worker version metadata binding", () => {
    expect(
      getSitesRendererVersion({
        CF_VERSION_METADATA: { id: "version-a", tag: "test", timestamp: "2026-05-17T00:00:00.000Z" },
      }),
    ).toBe("version-a");
  });

  it("round-trips a valid envelope through JSON.stringify and parseSitePmJsonEnvelope", () => {
    const text = JSON.stringify(ENVELOPE);
    expect(parseSitePmJsonEnvelope(text)).toEqual(ENVELOPE);
  });

  it("rejects malformed top-level JSON", () => {
    expect(parseSitePmJsonEnvelope("not json")).toBeNull();
    expect(parseSitePmJsonEnvelope("<!doctype html>")).toBeNull();
  });

  it("rejects envelopes missing required fields", () => {
    expect(
      parseSitePmJsonEnvelope(JSON.stringify({ metrics: { words: 0, characters: 0 }, updatedAt: "2026-05-17" })),
    ).toBeNull();
    expect(parseSitePmJsonEnvelope(JSON.stringify({ content: { type: "doc" }, updatedAt: "2026-05-17" }))).toBeNull();
    expect(
      parseSitePmJsonEnvelope(JSON.stringify({ content: { type: "doc" }, metrics: { words: 0, characters: 0 } })),
    ).toBeNull();
    expect(
      parseSitePmJsonEnvelope(
        JSON.stringify({ content: { type: "doc" }, metrics: { words: 0, characters: 0 }, updatedAt: 0 }),
      ),
    ).toBeNull();
  });

  it("rejects the old SiteRenderArtifact shape so it falls through to projection", () => {
    expect(
      parseSitePmJsonEnvelope(
        JSON.stringify({
          version: 1,
          bodyHtml: "<p>cached</p>",
          outline: [{ id: "intro", text: "Intro", level: 1, href: "#intro" }],
          metrics: { words: 2, characters: 12 },
        }),
      ),
    ).toBeNull();
  });

  it("validates nested PM JSON content recursively", () => {
    const valid = parseSitePmJsonEnvelope(
      JSON.stringify({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "hi" }],
            },
          ],
        },
        metrics: { words: 1, characters: 2 },
        updatedAt: "2026-05-17",
      }),
    );
    expect(valid).not.toBeNull();
  });
});

describe("createSiteHtmlRevision", () => {
  const base = {
    rendererVersion: "worker-version-1",
    site: {
      workspace_id: "ws1",
      slug: "acme",
      home_page_id: "page1",
      updated_at: "2026-05-17T12:00:00.000Z",
      workspace_name: "Acme",
      workspace_icon: "A",
    },
    page: {
      id: "page1",
      title: "Home",
      icon: "H",
      cover_url: null,
      updated_at: "2026-05-17T12:00:00.000Z",
      published_root_id: "page1",
    },
    canonicalPath: "/",
    currentIsHome: true,
  };

  it("changes for site, page, renderer, canonical, workspace identity, and root inputs", async () => {
    const revision = await createSiteHtmlRevision(base);
    const changedInputs = [
      { ...base, rendererVersion: "worker-version-2" },
      { ...base, site: { ...base.site, updated_at: "2026-05-17T12:01:00.000Z" } },
      { ...base, site: { ...base.site, workspace_name: "Renamed" } },
      { ...base, site: { ...base.site, workspace_icon: "B" } },
      { ...base, page: { ...base.page, updated_at: "2026-05-17T12:02:00.000Z" } },
      { ...base, page: { ...base.page, title: "Renamed Home" } },
      { ...base, page: { ...base.page, published_root_id: "root2" } },
      { ...base, canonicalPath: "/renamed-page1" },
    ];

    for (const input of changedInputs) {
      await expect(createSiteHtmlRevision(input)).resolves.not.toBe(revision);
    }
  });
});

describe("siteHtmlEtagMatches", () => {
  const etag = buildSiteHtmlEtag("revision-1");

  it("supports exact, weak, list, and wildcard validators", () => {
    expect(siteHtmlEtagMatches(etag, etag)).toBe(true);
    expect(siteHtmlEtagMatches(`W/${etag}`, etag)).toBe(true);
    expect(siteHtmlEtagMatches(`"other", ${etag}`, etag)).toBe(true);
    expect(siteHtmlEtagMatches("*", etag)).toBe(true);
    expect(siteHtmlEtagMatches('"other"', etag)).toBe(false);
  });
});

describe("createRenderDependencyHash", () => {
  it("is stable across object-key order", async () => {
    const a = await createRenderDependencyHash({ b: 1, a: 2 });
    const b = await createRenderDependencyHash({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("changes when any render-affecting input changes", async () => {
    const base = await createRenderDependencyHash({ site: { name: "A" }, mentions: [] });
    const renamed = await createRenderDependencyHash({ site: { name: "B" }, mentions: [] });
    const withMention = await createRenderDependencyHash({
      site: { name: "A" },
      mentions: [{ pageId: "01ABC", reachable: true }],
    });
    expect(renamed).not.toBe(base);
    expect(withMention).not.toBe(base);
  });

  it("returns a non-empty base64url digest", async () => {
    const hash = await createRenderDependencyHash({ ok: true });
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hash.length).toBeGreaterThan(20);
  });
});
