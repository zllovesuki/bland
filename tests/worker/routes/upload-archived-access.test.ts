import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { apiRequest } from "@tests/worker/helpers/request";
import { refreshCookieFor } from "@tests/worker/helpers/auth";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { ApiErrorResponse } from "@tests/worker/helpers/schemas";
import { seedPage, seedPageShare, seedUpload, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function putR2(key: string, bytes: Uint8Array) {
  await env.R2.put(key, bytes);
}

async function resetR2() {
  let cursor: string | undefined;
  do {
    const list = await env.R2.list({ cursor });
    if (list.objects.length > 0) {
      await env.R2.delete(list.objects.map((o) => o.key));
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

describe("GET /uploads/:id - archived page gating", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await resetR2();
  });

  it("returns 404 for page-scoped uploads when the linked page is archived (member via cookie)", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const archivedPage = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      archived_at: "2026-04-01T00:00:00.000Z",
    });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: archivedPage.id,
      uploaded_by: owner.id,
      r2_key: "uploads/archived-page-asset.png",
    });
    await putR2(upload.r2_key, new Uint8Array([1, 2, 3]));

    const cookie = await refreshCookieFor(owner.id);
    const res = await apiRequest(`/uploads/${upload.id}`, { cookie });

    expect(res.status).toBe(404);
    expect(ApiErrorResponse.parse(await res.json()).error).toBe("not_found");
  });

  it("serves workspace-level uploads (no page_id) for any authenticated member without archive checks", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: null,
      uploaded_by: owner.id,
      r2_key: "uploads/avatar.png",
      content_type: "image/png",
    });
    await putR2(upload.r2_key, new Uint8Array([9, 8, 7]));

    const cookie = await refreshCookieFor(owner.id);
    const res = await apiRequest(`/uploads/${upload.id}`, { cookie });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("returns 404 for archived page-scoped uploads accessed via share token", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const archivedPage = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      archived_at: "2026-04-01T00:00:00.000Z",
    });
    await seedPageShare({
      page_id: archivedPage.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-archived",
      permission: "view",
    });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: archivedPage.id,
      uploaded_by: owner.id,
      r2_key: "uploads/share-archived.png",
    });
    await putR2(upload.r2_key, new Uint8Array([4, 5, 6]));

    const res = await apiRequest(`/uploads/${upload.id}`, { shareToken: "tok-archived" });
    expect(res.status).toBe(404);
    expect(ApiErrorResponse.parse(await res.json()).error).toBe("not_found");
  });

  it("serves page-scoped uploads for members when the page is not archived", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: page.id,
      uploaded_by: owner.id,
      r2_key: "uploads/live-page-asset.png",
      content_type: "image/png",
    });
    await putR2(upload.r2_key, new Uint8Array([2, 4, 6, 8]));

    const cookie = await refreshCookieFor(owner.id);
    const res = await apiRequest(`/uploads/${upload.id}`, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("cache-control")).toContain("max-age=300");
  });
});
