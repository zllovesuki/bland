import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { GRADIENT_PRESETS } from "@/shared/page-cover";
import {
  coverMetadata,
  createSiteCoverHash,
  SITE_COVER_FORMAT,
  SITE_COVER_HEIGHT,
  SITE_COVER_WIDTH,
  siteCoverKey,
  type SiteCoverSource,
} from "@/worker/sites/cover";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { expectSitesStaticDocumentPreloadLinks } from "@tests/worker/helpers/sites";
import {
  seedPage,
  seedPublishedPage,
  seedUpload,
  seedUser,
  seedWorkspace,
  seedWorkspaceSite,
} from "@tests/worker/helpers/seeds";

const SUBDOMAIN_ORIGIN = "https://acme.sites.test";

async function putR2(key: string, body: string): Promise<void> {
  await env.R2.put(key, body, { httpMetadata: { contentType: "image/png" } });
}

async function responseTextFromBytes(response: Response): Promise<string> {
  return new TextDecoder().decode(await response.arrayBuffer());
}

async function putSitesCover(
  workspaceId: string,
  pageId: string,
  coverUrl: string,
  body = "PNG_BYTES",
  source: SiteCoverSource = "gradient",
): Promise<void> {
  const coverHash = await createSiteCoverHash(coverUrl);
  await env.SITES.put(siteCoverKey(workspaceId, pageId), body, {
    httpMetadata: { contentType: SITE_COVER_FORMAT },
    customMetadata: coverMetadata(coverUrl, coverHash, source),
  });
}

describe("Sites asset gate", () => {
  beforeEach(async () => {
    await resetD1Tables();
    // Best-effort R2 cleanup. Miniflare R2 persists across tests in some configs,
    // so explicit deletes are safer than relying on test isolation.
    const [r2Listing, sitesListing] = await Promise.all([env.R2.list(), env.SITES.list()]);
    await Promise.all([
      ...r2Listing.objects.map((o) => env.R2.delete(o.key)),
      ...sitesListing.objects.map((o) => env.SITES.delete(o.key)),
    ]);
  });

  it("serves a public asset for a published page", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Page" });
    const upload = await seedUpload({
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: `${ws.id}/${page.id}/cover.png`,
    });
    await putR2(upload.r2_key, "PNG_BYTES");
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/${upload.id}`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=300");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe("PNG_BYTES");
  });

  it("404s when the page is unpublished", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: `${ws.id}/${page.id}/cover.png`,
    });
    await putR2(upload.r2_key, "PNG");
    await seedWorkspaceSite({ workspace_id: ws.id });
    // No publish row.

    const res = await apiRequest(`/_assets/${page.id}/${upload.id}`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("404s when the upload belongs to a different page", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const pageA = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const pageB = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: pageA.id,
      r2_key: `${ws.id}/${pageA.id}/cover.png`,
    });
    await putR2(upload.r2_key, "PNG");
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: pageB.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${pageB.id}/${upload.id}`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expectSitesStaticDocumentPreloadLinks(res);
  });

  it("404s when the upload belongs to a different workspace", async () => {
    const ownerA = await seedUser();
    const ownerB = await seedUser();
    const wsA = await seedWorkspace({ owner_id: ownerA.id, slug: "ws-a" });
    const wsB = await seedWorkspace({ owner_id: ownerB.id, slug: "ws-b" });
    const pageA = await seedPage({ workspace_id: wsA.id, created_by: ownerA.id });
    const pageB = await seedPage({ workspace_id: wsB.id, created_by: ownerB.id });
    const uploadB = await seedUpload({
      workspace_id: wsB.id,
      uploaded_by: ownerB.id,
      page_id: pageB.id,
      r2_key: `${wsB.id}/${pageB.id}/cover.png`,
    });
    await putR2(uploadB.r2_key, "PNG");
    await seedWorkspaceSite({ workspace_id: wsA.id });
    await seedPublishedPage({ workspace_id: wsA.id, page_id: pageA.id, published_by: ownerA.id });

    const res = await apiRequest(`/_assets/${pageA.id}/${uploadB.id}`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("404s when the R2 object is missing despite a valid D1 row", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: `${ws.id}/${page.id}/cover.png`,
    });
    // Deliberately do NOT put the R2 object.
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/${upload.id}`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("404s when the upload id does not exist", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/01ZZZZ`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
  });

  it("does not stream original uploads through the cover route", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Upload Cover",
      cover_url: "/uploads/upload-cover",
    });
    const upload = await seedUpload({
      id: "upload-cover",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: `${ws.id}/${page.id}/cover.webp`,
      content_type: "image/webp",
    });
    await putR2(upload.r2_key, "WEBP_BYTES");
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toBeNull();
    expect(await res.text()).toBe("");
  });

  it("serves matching uploaded derived cover artifacts", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const coverUrl = "/uploads/upload-cover";
    const page = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Upload Cover",
      cover_url: coverUrl,
    });
    const upload = await seedUpload({
      id: "upload-cover",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: `${ws.id}/${page.id}/cover.webp`,
      content_type: "image/webp",
    });
    await putR2(upload.r2_key, "WEBP_BYTES");
    await putSitesCover(ws.id, page.id, coverUrl, "DERIVED_PNG", "upload");
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, {
      origin: SUBDOMAIN_ORIGIN,
      search: { v: await createSiteCoverHash(coverUrl) },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(SITE_COVER_FORMAT);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await responseTextFromBytes(res)).toBe("DERIVED_PNG");
  });

  it("404s upload covers that are not scoped to the current page", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/other-cover" });
    const otherPage = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      id: "other-cover",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: otherPage.id,
      r2_key: `${ws.id}/${otherPage.id}/cover.png`,
    });
    await putR2(upload.r2_key, "PNG_BYTES");
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBeNull();
    expect(await res.text()).toBe("");
  });

  it("404s unsafe upload cover types with an empty response", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/unsafe-cover" });
    const upload = await seedUpload({
      id: "unsafe-cover",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      content_type: "image/heic",
      r2_key: `${ws.id}/${page.id}/cover.heic`,
    });
    await putR2(upload.r2_key, "HEIC_BYTES");
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBeNull();
    expect(await res.text()).toBe("");
  });

  it("404s upload covers when the original upload object is missing", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/missing-cover" });
    await seedUpload({
      id: "missing-cover",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: `${ws.id}/${page.id}/missing.png`,
    });
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBeNull();
    expect(await res.text()).toBe("");
  });

  it("404s unpublished cover requests even when the upload object exists", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/cover-upload" });
    const upload = await seedUpload({
      id: "cover-upload",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: `${ws.id}/${page.id}/cover.png`,
    });
    await putR2(upload.r2_key, "PNG_BYTES");
    await seedWorkspaceSite({ workspace_id: ws.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, { origin: SUBDOMAIN_ORIGIN });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("serves matching generated cover artifacts and caches versioned URLs immutably", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const cover = GRADIENT_PRESETS[0];
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: cover });
    await putSitesCover(ws.id, page.id, cover, "PNG_BYTES");
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, {
      origin: SUBDOMAIN_ORIGIN,
      search: { v: await createSiteCoverHash(cover) },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await responseTextFromBytes(res)).toBe("PNG_BYTES");
  });

  it("503s missing or stale generated cover artifacts with an empty repair response", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const cover = GRADIENT_PRESETS[0];
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: cover });
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const missing = await apiRequest(`/_assets/${page.id}/cover`, { origin: SUBDOMAIN_ORIGIN });
    expect(missing.status).toBe(503);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(missing.headers.get("retry-after")).toBe("5");
    expect(missing.headers.get("content-type")).toBeNull();
    expect(await missing.text()).toBe("");

    await env.SITES.put(siteCoverKey(ws.id, page.id), "STALE", {
      httpMetadata: { contentType: "image/png" },
      customMetadata: {
        cover_hash: "old",
        cover_url: cover,
        width: String(SITE_COVER_WIDTH),
        height: String(SITE_COVER_HEIGHT),
      },
    });

    const stale = await apiRequest(`/_assets/${page.id}/cover`, { origin: SUBDOMAIN_ORIGIN });
    expect(stale.status).toBe(503);
    expect(stale.headers.get("content-type")).toBeNull();
    expect(await stale.text()).toBe("");
  });

  it("404s old versioned generated cover URLs after the cover changes", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const currentCover = GRADIENT_PRESETS[1];
    const oldHash = await createSiteCoverHash(GRADIENT_PRESETS[0]);
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: currentCover });
    await putSitesCover(ws.id, page.id, currentCover);
    await seedWorkspaceSite({ workspace_id: ws.id });
    await seedPublishedPage({ workspace_id: ws.id, page_id: page.id, published_by: owner.id });

    const res = await apiRequest(`/_assets/${page.id}/cover`, {
      origin: SUBDOMAIN_ORIGIN,
      search: { v: oldHash },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBeNull();
    expect(await res.text()).toBe("");
  });
});
