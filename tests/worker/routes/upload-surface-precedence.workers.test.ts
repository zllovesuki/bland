import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { uploads } from "@/worker/db/d1/schema";
import { apiRequest } from "@tests/worker/helpers/request";
import { refreshCookieFor } from "@tests/worker/helpers/auth";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
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

describe("uploads: shared-surface precedence", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await resetR2();
  });

  describe("POST /workspaces/:wid/uploads/presign", () => {
    it("rejects a member with ?share= on a page where the share is view-only", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await seedPageShare({
        page_id: page.id,
        created_by: owner.id,
        grantee_type: "link",
        grantee_id: null,
        link_token: "tok-view-only",
        permission: "view",
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/uploads/presign`, {
        method: "POST",
        body: { filename: "f.png", content_type: "image/png", size_bytes: 1024, page_id: page.id },
        userId: member.id,
        shareToken: "tok-view-only",
      });

      expect(res.status).toBe(403);
    });

    it("uses the share creator as uploaded_by when ?share= grants edit (even for a canonical member)", async () => {
      const owner = await seedUser();
      const shareCreator = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: shareCreator.id, workspace_id: ws.id, role: "member" });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await seedPageShare({
        page_id: page.id,
        created_by: shareCreator.id,
        grantee_type: "link",
        grantee_id: null,
        link_token: "tok-edit",
        permission: "edit",
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/uploads/presign`, {
        method: "POST",
        body: { filename: "f.png", content_type: "image/png", size_bytes: 1024, page_id: page.id },
        userId: member.id,
        shareToken: "tok-edit",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { upload: { id: string } };
      const uploadRow = await getDb().select().from(uploads).where(eq(uploads.id, body.upload.id)).get();
      expect(uploadRow?.uploaded_by).toBe(shareCreator.id);
    });

    it("uses the caller id as uploaded_by when no share is presented (canonical member path)", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/uploads/presign`, {
        method: "POST",
        body: { filename: "f.png", content_type: "image/png", size_bytes: 1024, page_id: page.id },
        userId: member.id,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { upload: { id: string } };
      const uploadRow = await getDb().select().from(uploads).where(eq(uploads.id, body.upload.id)).get();
      expect(uploadRow?.uploaded_by).toBe(member.id);
    });
  });

  describe("PUT /uploads/:id/data", () => {
    it("authorizes a member with ?share= via the share principal, not uploaded_by match", async () => {
      const owner = await seedUser();
      const shareCreator = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: shareCreator.id, workspace_id: ws.id, role: "member" });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await seedPageShare({
        page_id: page.id,
        created_by: shareCreator.id,
        grantee_type: "link",
        grantee_id: null,
        link_token: "tok-edit-put",
        permission: "edit",
      });
      const upload = await seedUpload({
        workspace_id: ws.id,
        page_id: page.id,
        uploaded_by: shareCreator.id,
        filename: "f.png",
        size_bytes: 4,
        content_type: "image/png",
        r2_key: `${ws.id}/share-uploaded-id/f.png`,
      });

      const res = await apiRequest(`/uploads/${upload.id}/data`, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: new Uint8Array([1, 2, 3, 4]).buffer,
        userId: member.id,
        shareToken: "tok-edit-put",
      });

      expect(res.status).toBe(200);
    });

    it("denies a member with ?share= when the share does not grant edit (no canonical fallback)", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await seedPageShare({
        page_id: page.id,
        created_by: owner.id,
        grantee_type: "link",
        grantee_id: null,
        link_token: "tok-view-put",
        permission: "view",
      });
      const upload = await seedUpload({
        workspace_id: ws.id,
        page_id: page.id,
        uploaded_by: member.id,
        filename: "f.png",
        size_bytes: 4,
        content_type: "image/png",
        r2_key: `${ws.id}/member-uploaded-id/f.png`,
      });

      const res = await apiRequest(`/uploads/${upload.id}/data`, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: new Uint8Array([1, 2, 3, 4]).buffer,
        userId: member.id,
        shareToken: "tok-view-put",
      });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /uploads/:id", () => {
    it("serves a page-scoped asset via share principal when ?share= is provided", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await seedPageShare({
        page_id: page.id,
        created_by: owner.id,
        grantee_type: "link",
        grantee_id: null,
        link_token: "tok-view-get",
        permission: "view",
      });
      const upload = await seedUpload({
        workspace_id: ws.id,
        page_id: page.id,
        uploaded_by: owner.id,
        r2_key: `${ws.id}/share-get/f.png`,
        content_type: "image/png",
      });
      await env.R2.put(upload.r2_key, new Uint8Array([1, 2, 3]));

      const res = await apiRequest(`/uploads/${upload.id}`, { shareToken: "tok-view-get" });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, max-age=300, must-revalidate");
    });

    it("returns 401 when ?share= token is invalid and no cookie provides canonical auth fallback", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      const upload = await seedUpload({
        workspace_id: ws.id,
        page_id: page.id,
        uploaded_by: owner.id,
        r2_key: `${ws.id}/bad-share/f.png`,
      });
      await env.R2.put(upload.r2_key, new Uint8Array([1]));

      const res = await apiRequest(`/uploads/${upload.id}`, { shareToken: "tok-does-not-exist" });
      // Local loopback converts 401 to 403 at the router layer.
      expect([401, 403]).toContain(res.status);
    });

    it("keeps long cache-control for workspace-level assets (no page_id)", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const upload = await seedUpload({
        workspace_id: ws.id,
        page_id: null,
        uploaded_by: owner.id,
        r2_key: `${ws.id}/avatar.png`,
        content_type: "image/png",
      });
      await env.R2.put(upload.r2_key, new Uint8Array([7, 8, 9]));

      const cookie = await refreshCookieFor(owner.id);
      const res = await apiRequest(`/uploads/${upload.id}`, { cookie });

      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    });
  });
});
