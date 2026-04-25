import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { apiRequest, PROD_ORIGIN } from "@tests/worker/helpers/request";
import { resetD1Tables } from "@tests/worker/helpers/db";
import {
  seedMembership,
  seedPage,
  seedPageShare,
  seedUpload,
  seedUser,
  seedWorkspace,
} from "@tests/worker/helpers/seeds";

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

describe("PUT /uploads/:id/data - auth status semantics", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await resetR2();
  });

  it("returns 401 unauthorized when no share token and no bearer is provided", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: page.id,
      uploaded_by: owner.id,
      r2_key: "uploads/no-bearer.png",
    });

    const res = await apiRequest(`/uploads/${upload.id}/data`, {
      method: "PUT",
      body: new ArrayBuffer(8),
      headers: { "content-type": "image/png" },
      origin: PROD_ORIGIN,
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 forbidden for a valid bearer that does not own the upload row", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: page.id,
      uploaded_by: owner.id,
      r2_key: "uploads/non-owner.png",
    });

    const res = await apiRequest(`/uploads/${upload.id}/data`, {
      method: "PUT",
      body: new ArrayBuffer(8),
      headers: { "content-type": "image/png" },
      userId: member.id,
      origin: PROD_ORIGIN,
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("returns 403 forbidden when a share token does not grant edit", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-view",
      permission: "view",
    });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: page.id,
      uploaded_by: owner.id,
      r2_key: "uploads/share-view.png",
    });

    const res = await apiRequest(`/uploads/${upload.id}/data`, {
      method: "PUT",
      body: new ArrayBuffer(8),
      headers: { "content-type": "image/png" },
      shareToken: "tok-view",
      origin: PROD_ORIGIN,
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("returns 200 for a share token with edit permission", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-edit",
      permission: "edit",
    });
    const upload = await seedUpload({
      workspace_id: ws.id,
      page_id: page.id,
      uploaded_by: owner.id,
      r2_key: "uploads/share-edit.png",
      content_type: "image/png",
      size_bytes: 8,
    });

    const res = await apiRequest(`/uploads/${upload.id}/data`, {
      method: "PUT",
      body: new ArrayBuffer(8),
      headers: { "content-type": "image/png" },
      shareToken: "tok-edit",
      origin: PROD_ORIGIN,
    });

    expect(res.status).toBe(200);
  });
});
