import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
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

describe("Sites asset gate", () => {
  beforeEach(async () => {
    await resetD1Tables();
    // Best-effort R2 cleanup. Miniflare R2 persists across tests in some configs,
    // so explicit deletes are safer than relying on test isolation.
    const listing = await env.R2.list();
    await Promise.all(listing.objects.map((o) => env.R2.delete(o.key)));
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
});
