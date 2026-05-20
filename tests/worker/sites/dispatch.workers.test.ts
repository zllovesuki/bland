import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as Y from "yjs";

import { workspaceSites, workspaces } from "@/worker/db/d1/schema";
import { YJS_DOCUMENT_STORE } from "@/shared/constants";
import { resetD1Tables, getDb } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import {
  expectSitesPageDocumentPreloadLinks,
  expectSitesStaticDocumentPreloadLinks,
} from "@tests/worker/helpers/sites";
import {
  deletePublishedPage,
  seedPage,
  seedPublishedPage,
  seedUser,
  seedWorkspace,
  seedWorkspaceSite,
} from "@tests/worker/helpers/seeds";
import { seedDocSyncSnapshot, buildYjsDocBytes } from "@tests/worker/helpers/do";
import { buildSiteCacheKey, buildSiteR2ObjectKey, getSitesCache, writeSiteR2 } from "@/worker/sites/cache";
import { buildSitePagePath } from "@/worker/lib/site-public-url";

const SUBDOMAIN_ORIGIN = "https://acme.sites.test";
const APEX_ORIGIN = "https://sites.test";

async function setSiteDisabled(workspaceId: string): Promise<void> {
  await getDb().update(workspaceSites).set({ published_at: null }).where(eq(workspaceSites.workspace_id, workspaceId));
}

async function clearSitesHtmlBucket(): Promise<void> {
  const listing = await env.SITES.list();
  await Promise.all(listing.objects.map((object) => env.SITES.delete(object.key)));
}

async function deleteHtmlCache(path: string, origin = SUBDOMAIN_ORIGIN): Promise<void> {
  const cache = await getSitesCache();
  await cache.delete(buildSiteCacheKey(new Request(new URL(path, origin).toString())));
}

async function clearRootHtmlCache(): Promise<void> {
  await deleteHtmlCache("/");
}

async function waitForSitesCacheHit(path: string): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    last = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    if (last.headers.get("server-timing")?.includes('cache_write;desc="skipped_hit"')) return last;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return last ?? apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
}

function timingCount(response: Response, name: string): number {
  return response.headers.get("server-timing")?.match(new RegExp(`\\b${name}\\b`, "g"))?.length ?? 0;
}

function publicPagePath(title: string, pageId: string): string {
  return buildSitePagePath(pageId, title);
}

function buildOutlineDocBytes(): Uint8Array {
  const doc = new Y.Doc();
  try {
    const fragment = doc.getXmlFragment(YJS_DOCUMENT_STORE);
    const first = new Y.XmlElement("heading");
    first.setAttribute("level", "1");
    first.setAttribute("bid", "H_INTRO");
    first.insert(0, [new Y.XmlText("Intro")]);

    const duplicate = new Y.XmlElement("heading");
    duplicate.setAttribute("level", "2");
    duplicate.setAttribute("bid", "H_DUP");
    duplicate.insert(0, [new Y.XmlText("Intro")]);

    const empty = new Y.XmlElement("heading");
    empty.setAttribute("level", "3");
    empty.setAttribute("bid", "H_EMPTY");

    fragment.insert(0, [first, duplicate, empty]);
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

function buildMentionDocBytes(pageId: string): Uint8Array {
  const doc = new Y.Doc();
  try {
    const fragment = doc.getXmlFragment(YJS_DOCUMENT_STORE);
    const paragraph = new Y.XmlElement("paragraph");
    const mention = new Y.XmlElement("pageMention");
    mention.setAttribute("pageId", pageId);
    paragraph.insert(0, [new Y.XmlText("See "), mention]);
    fragment.insert(0, [paragraph]);
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

describe("Sites host dispatch", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await clearRootHtmlCache();
  });

  it("serves the apex placeholder at /", async () => {
    const res = await apiRequest("/", { origin: APEX_ORIGIN });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expectSitesStaticDocumentPreloadLinks(res);
    const html = await res.text();
    expect(html).toContain("bland.");
    expect(html).toContain("bg-[linear-gradient(135deg");
    expect(html).toContain("text-transparent");
  });

  it("404s any non-root path on apex", async () => {
    const res = await apiRequest("/anything", { origin: APEX_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("serves robots.txt on subdomain hosts", async () => {
    const res = await apiRequest("/robots.txt", { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain("Allow: /");
  });

  it("rejects POST on a site host", async () => {
    const res = await apiRequest("/", { method: "POST", body: null, origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(405);
  });

  it("404s a subdomain that has no site row", async () => {
    const res = await apiRequest("/", { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expectSitesStaticDocumentPreloadLinks(res);
  });

  it("404s a subdomain whose site row is disabled", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await setSiteDisabled(ws.id);

    const res = await apiRequest("/", { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("404s the home request when home_page_id is unset", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });

    const res = await apiRequest("/", { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("does not intercept non-site hosts", async () => {
    // A loopback test origin like 127.0.0.1 lands in the existing SPA shell branch.
    const res = await apiRequest("/", { origin: "http://127.0.0.1" });
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(405);
  });
});

describe("Sites page resolution", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await clearSitesHtmlBucket();
    await clearRootHtmlCache();
  });

  it("renders a published doc page with title, .tiptap wrapper, stylesheet link, and canonical", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Hello Sites" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(publicPagePath("Hello Sites", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expectSitesPageDocumentPreloadLinks(res);
    const html = await res.text();
    expect(html).toMatch(/^<!DOCTYPE html><html/);
    expect(html).not.toContain("<!doctype html><!DOCTYPE html>");
    expect(html).toContain("<title>Hello Sites</title>");
    expect(html).toContain('class="site-shell flex min-h-screen flex-col bg-canvas');
    expect(html).toContain('class="site-header sticky top-0 z-50');
    expect(html).toContain('class="site-container mx-auto min-w-0 max-w-3xl"');
    expect(html).toContain('class="site-footer mt-16 shrink-0');
    expect(html).toContain('class="tiptap-document-lead"');
    expect(html).toContain('class="tiptap tiptap-page-body"');
    expect(html).toContain("mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-1");
    expect(html).toContain('aria-label="Document metrics: 0 words, 0 chars, 0 min read"');
    expect(html).not.toContain("tiptap-outline");
    expect(html).not.toContain("sm:pl-7");
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/icons/favicon.ico"');
    expect(html).toContain('href="/icons/icon.svg"');
    expect(html).toContain('href="/icons/favicon-32x32.png"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="theme-color" content="#171717"');
    expect(html).not.toContain('href="data:,"');
    expect(html).toContain('href="/site-assets/sites-test.css"');
    expect(html).toContain('rel="preload" as="style" href="/site-assets/fonts-test.css"');
    expect(html).toContain('rel="stylesheet" href="/site-assets/fonts-test.css"');
    expect(html).toContain('data-precedence="default"');
    expect(html).toContain('rel="modulepreload"');
    expect(html).toContain('href="/site-assets/outline-model-test.js"');
    expect(html).toContain('src="/site-assets/sites-entry-test.js"');
    expect(html.indexOf('rel="preload" as="style" href="/site-assets/fonts-test.css"')).toBeLessThan(
      html.indexOf("<body"),
    );
    expect(html.lastIndexOf('rel="stylesheet" href="/site-assets/fonts-test.css"')).toBeGreaterThan(
      html.indexOf("</main>"),
    );
    expect(html.indexOf('src="/site-assets/sites-entry-test.js"')).toBeGreaterThan(
      html.lastIndexOf('rel="stylesheet" href="/site-assets/fonts-test.css"'),
    );
    expect(html).not.toContain("vendor-excalidraw");
    expect(html).not.toContain("vendor-prosemirror");
    expect(html).not.toContain("vendor-tiptap");
    expect(html).not.toContain("vendor-yjs");
    expect(html).not.toContain("/_sites.css");
    expect(html).not.toContain("/_sites.js");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain(`href="https://acme.sites.test${publicPagePath("Hello Sites", page.id)}"`);
    expect(html).toContain('property="og:title"');
    // The full document is composed at request time, so current deploy assets
    // may appear here; the cached/R2 artifact remains body-only.
    // Host-neutral: stored shell does not embed the site slug.
    expect(html).not.toContain("&middot; acme");
    expect(html).not.toMatch(/&middot;\s*acme/);
  });

  it("renders document outline markup through the shared document frame", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Outline Page" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildOutlineDocBytes());

    const res = await apiRequest(publicPagePath("Outline Page", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('<h1 id="intro" data-bid="H_INTRO">Intro</h1>');
    expect(html).toContain('<h2 id="intro-2" data-bid="H_DUP">Intro</h2>');
    expect(html).toContain('<h3 data-bid="H_EMPTY"></h3>');
    expect(html).toContain('class="tiptap-outline"');
    expect(html).toContain('class="tiptap-outline tiptap-outline--rail"');
    expect(html).toContain('data-outline-id="intro"');
    expect(html).toContain('href="#intro-2"');
    expect(html).toContain("mx-auto mb-8 w-full min-w-0 max-w-3xl min-[1280px]:hidden");
    expect(html).toContain("min-[1280px]:grid-cols-[12rem_minmax(0,48rem)_12rem]");
    expect(html).toContain("min-[1280px]:col-start-2");
    expect(html).toContain("min-[1280px]:col-start-3");
    expect(html).toContain("min-[1280px]:pt-[5.5rem]");
    expect(html.indexOf('class="tiptap-outline"')).toBeLessThan(
      html.indexOf('<div class="tiptap tiptap-page-body"><h1 id="intro"'),
    );
    expect(html).not.toContain("site-header-stage--with-outline");
    expect(html).not.toContain("site-stage--with-outline");
    expect(html).not.toContain("site-outline-rail");
  });

  it("renders page icons for accessible page mentions", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Mentions" });
    const target = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Target Page",
      icon: "T",
    });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: target.id, published_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildMentionDocBytes(target.id));

    const res = await apiRequest(publicPagePath("Mentions", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`data-page-id="${target.id}"`);
    expect(html).toContain('href="/target-page-');
    expect(html).toContain('<span class="tiptap-page-mention-icon" aria-hidden="true">T</span>');
    expect(html).toContain('<span class="tiptap-page-mention-label">Target Page</span>');
  });

  it("redirects to canonical slug on slug mismatch", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Hello Sites" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/wrong-slug-${page.id}`, {
      origin: SUBDOMAIN_ORIGIN,
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(publicPagePath("Hello Sites", page.id));
  });

  it("redirects legacy uppercase page IDs to lowercase canonical URLs", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Hello Sites" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/hello-sites-${page.id}`, {
      origin: SUBDOMAIN_ORIGIN,
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(publicPagePath("Hello Sites", page.id));
  });

  it("redirects /<slug>-<homeId> to /", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Welcome" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme", home_page_id: page.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(publicPagePath("Welcome", page.id), {
      origin: SUBDOMAIN_ORIGIN,
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/\/$/);
  });

  it("serves home page at /", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Welcome" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme", home_page_id: page.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest("/", { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>Welcome</title>");
  });

  it("404s an unpublished page", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Hidden" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });

    const res = await apiRequest(publicPagePath("Hidden", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("404s a canvas page even when in publish set", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const canvas = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Canvas", kind: "canvas" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: canvas.id, published_by: owner.id });

    const res = await apiRequest(publicPagePath("Canvas", canvas.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("404s an archived page", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Stale",
      archived_at: new Date().toISOString(),
    });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(publicPagePath("Stale", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("404s a published page from another workspace", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id, slug: "site-workspace" });
    const otherWs = await seedWorkspace({ owner_id: owner.id, slug: "other-workspace" });
    const page = await seedPage({ workspace_id: otherWs.id, created_by: owner.id, title: "Elsewhere" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: otherWs.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(publicPagePath("Elsewhere", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Elsewhere");
  });

  it("serves bounded stale HTML after unpublish until the request cache entry expires", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Ephemeral" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const path = publicPagePath("Ephemeral", page.id);
    const first = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(first.status).toBe(200);

    const cached = await waitForSitesCacheHit(path);
    expect(cached.status).toBe(200);
    expectSitesPageDocumentPreloadLinks(cached);
    expect(cached.headers.get("server-timing")).not.toContain("site_page_lookup");

    // Option B deliberately allows request-keyed HTML to remain public until
    // the 300-second internal Cache API TTL expires.
    await deletePublishedPage(ws.id, page.id);

    const stale = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(stale.status).toBe(200);
    expect(stale.headers.get("server-timing")).not.toContain("site_page_lookup");
    expect(await stale.text()).toContain("<title>Ephemeral</title>");

    await deleteHtmlCache(path);

    const fresh = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(fresh.status).toBe(404);
  });

  it("renders inherited subpages under a published ancestor", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const parent = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Parent" });
    const child = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: parent.id,
      title: "Child",
    });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: parent.id, published_by: owner.id });

    const res = await apiRequest(publicPagePath("Child", child.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>Child</title>");
  });

  it("404s inherited subpages when an archived ancestor breaks the chain", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const root = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Root" });
    const archivedParent = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: root.id,
      title: "Archived Parent",
      archived_at: new Date().toISOString(),
    });
    const child = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: archivedParent.id,
      title: "Hidden Child",
    });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: root.id, published_by: owner.id });

    const res = await apiRequest(publicPagePath("Hidden Child", child.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Hidden Child");
  });

  it("includes seeded Yjs body text in the rendered HTML", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Seeded" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Seeded", "First paragraph of body"));

    const res = await apiRequest(publicPagePath("Seeded", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("First paragraph of body");
    expect(html).toContain('name="description" content="First paragraph of body"');
    expect(html).toContain('property="og:description" content="First paragraph of body"');
    expect(html).toContain('aria-label="Document metrics: 4 words, 23 chars, 1 min read"');
  });

  it("renders from a fresh R2 PM JSON envelope without re-projecting via DocSync", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Cached Page" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    await writeSiteR2(env, ws.id, page.id, {
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "R2 CACHED BODY" }] }],
      },
      metrics: { words: 3, characters: 14 },
      updatedAt: page.updated_at,
    });

    const res = await apiRequest(publicPagePath("Cached Page", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("R2 CACHED BODY");
    expect(html).toContain('aria-label="Document metrics: 3 words, 14 chars, 1 min read"');
  });

  it("serves repeat HTML from Cache API before reading R2 or rendering", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Repeat Cache" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Repeat Cache", "First cached body"));

    const path = publicPagePath("Repeat Cache", page.id);
    const first = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(first.status).toBe(200);
    expect(timingCount(first, "cache_read")).toBe(1);
    expect(await first.text()).toContain("First cached body");

    await writeSiteR2(env, ws.id, page.id, {
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "SECOND R2 BODY" }] }],
      },
      metrics: { words: 3, characters: 14 },
      updatedAt: page.updated_at,
    });

    const second = await waitForSitesCacheHit(path);
    expect(second.status).toBe(200);
    expect(second.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(second.headers.get("cache-tag")).toBeNull();
    expect(second.headers.get("server-timing")).toContain('cache_write;desc="skipped_hit"');
    expect(second.headers.get("server-timing")).not.toContain("site_page_lookup");
    expect(second.headers.get("server-timing")).not.toContain("r2_document");
    expect(second.headers.get("server-timing")).not.toContain("render_stream");
    const secondHtml = await second.text();
    expect(secondHtml).toContain("First cached body");
    expect(secondHtml).not.toContain("SECOND R2 BODY");

    const cache = await getSitesCache();
    const stored = await cache.match(buildSiteCacheKey(new Request(new URL(path, SUBDOMAIN_ORIGIN).toString())));
    expect(stored?.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
    expect(stored?.headers.get("cache-tag")).toBe(`sites-html,site:${ws.id},page:${page.id},root:${page.id}`);
  });

  it("returns 304 for a matching Sites HTML ETag before cache or document work", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Tagged" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const path = publicPagePath("Tagged", page.id);
    const first = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toMatch(/^"sites-html:/);

    const cached = await waitForSitesCacheHit(path);
    expect(cached.status).toBe(200);

    const second = await apiRequest(path, {
      origin: SUBDOMAIN_ORIGIN,
      headers: { "If-None-Match": etag ?? "" },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
    expect(second.headers.get("last-modified")).toBeTruthy();
    expect(second.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(second.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(second.headers.get("server-timing")).toContain('cache_read;desc="skipped_304"');
    expect(second.headers.get("server-timing")).not.toContain("site_page_lookup");
    expect(second.headers.get("server-timing")).not.toContain("r2_document");
    expect(second.headers.get("server-timing")).not.toContain("render_stream");
    expect(await second.text()).toBe("");
  });

  it("renders fresh site chrome around a cached PM JSON envelope", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id, name: "Old Workspace" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Chrome Cache" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    await writeSiteR2(env, ws.id, page.id, {
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Projected once" }] }],
      },
      metrics: { words: 2, characters: 14 },
      updatedAt: page.updated_at,
    });

    await getDb().update(workspaces).set({ name: "Fresh Workspace", icon: "B" }).where(eq(workspaces.id, ws.id));
    await getDb().update(workspaceSites).set({ home_page_id: page.id }).where(eq(workspaceSites.workspace_id, ws.id));

    const res = await apiRequest("/", { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Fresh Workspace");
    expect(html).toContain("Projected once");
    expect(html).not.toContain("Old Workspace");
    expect(html).not.toContain('aria-label="Workspace home"');
  });

  it("falls through to DocSync projection when R2 holds a legacy SiteRenderArtifact shape", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Deploy Fresh" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Deploy Fresh", "Fresh body"));

    await env.SITES.put(
      buildSiteR2ObjectKey(ws.id, page.id),
      JSON.stringify({
        version: 1,
        bodyHtml: "<p>STALE LEGACY BODY</p>",
        outline: [],
        metrics: { words: 1, characters: 5 },
      }),
      {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: { updated_at: page.updated_at },
      },
    );

    const res = await apiRequest(publicPagePath("Deploy Fresh", page.id), { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>Deploy Fresh</title>");
    expect(html).toContain("Fresh body");
    expect(html).not.toContain("STALE LEGACY BODY");
  });

  it("serves cached workspace chrome until the request cache entry expires", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id, name: "Old Co" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Renamed" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const path = publicPagePath("Renamed", page.id);
    const first = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(first.status).toBe(200);
    const firstHtml = await first.text();
    expect(firstHtml).toContain("Old Co");

    const cached = await waitForSitesCacheHit(path);
    expect(cached.status).toBe(200);

    await getDb().update(workspaces).set({ name: "New Co" }).where(eq(workspaces.id, ws.id));

    const stale = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(stale.status).toBe(200);
    expect(stale.headers.get("server-timing")).not.toContain("site_page_lookup");
    const staleHtml = await stale.text();
    expect(staleHtml).toContain("Old Co");
    expect(staleHtml).not.toContain("New Co");

    await deleteHtmlCache(path);

    const fresh = await apiRequest(path, { origin: SUBDOMAIN_ORIGIN });
    expect(fresh.status).toBe(200);
    const freshHtml = await fresh.text();
    expect(freshHtml).toContain("New Co");
    expect(freshHtml).not.toContain("Old Co");
  });
});
