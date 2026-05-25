import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

import { buildSitePagePath } from "@/worker/lib/site-public-url";
import { pages } from "@/worker/db/d1/schema";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest, expectJson } from "@tests/worker/helpers/request";
import { refreshCookieFor } from "@tests/worker/helpers/auth";
import { projectSitePage } from "@tests/worker/helpers/sites";
import {
  seedMembership,
  seedPage,
  seedPublishedPage,
  seedUpload,
  seedUser,
  seedWorkspace,
  seedWorkspaceSite,
} from "@tests/worker/helpers/seeds";
import { ApiErrorResponse } from "@tests/worker/helpers/schemas";

const SITE_ORIGIN = "https://acme.sites.test";

function sentIndexPageIds(): string[] {
  return vi
    .mocked(env.TASKS_QUEUE.sendBatch)
    .mock.calls.flatMap((call) =>
      Array.from(call[0], (entry) => (entry.body as { type: "index-page"; pageId: string }).pageId),
    );
}

async function resetR2() {
  let cursor: string | undefined;
  do {
    const list = await env.R2.list({ cursor });
    if (list.objects.length > 0) {
      await env.R2.delete(list.objects.map((object) => object.key));
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

describe("page archive visibility contract", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await resetR2();
  });

  it("archives an active subtree, preserves parent links, and returns every archived id", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const root = await seedPage({ id: "root", workspace_id: ws.id, created_by: owner.id, parent_id: null });
    const child = await seedPage({ id: "child", workspace_id: ws.id, created_by: owner.id, parent_id: root.id });
    const grandchild = await seedPage({
      id: "grandchild",
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: child.id,
    });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}`, {
      method: "DELETE",
      userId: owner.id,
    });

    expect(res.status).toBe(200);
    const body = await expectJson<{ ok: true; archived_page_ids: string[] }>(res);
    expect(new Set(body.archived_page_ids)).toEqual(new Set([root.id, child.id, grandchild.id]));
    expect(new Set(sentIndexPageIds())).toEqual(new Set([root.id, child.id, grandchild.id]));

    const rows = await getDb().select().from(pages).where(eq(pages.workspace_id, ws.id));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.archived_at).toBeTruthy();
      expect(row.archive_root_id).toBe(root.id);
    }
    expect(rows.find((row) => row.id === child.id)?.parent_id).toBe(root.id);
    expect(rows.find((row) => row.id === grandchild.id)?.parent_id).toBe(child.id);

    const archivedList = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/archived`, { userId: owner.id });
    expect(archivedList.status).toBe(200);
    expect(
      (await expectJson<{ pages: Array<{ id: string; archived_descendant_count: number }> }>(archivedList)).pages,
    ).toEqual([expect.objectContaining({ id: root.id, archived_descendant_count: 2 })]);
  });

  it("archives and restores subtrees larger than the D1 bound-parameter limit", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const root = await seedPage({ workspace_id: ws.id, created_by: owner.id, parent_id: null });
    for (let i = 0; i < 105; i += 1) {
      await seedPage({ workspace_id: ws.id, created_by: owner.id, parent_id: root.id, position: i });
    }

    const archiveRes = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}`, {
      method: "DELETE",
      userId: owner.id,
    });
    expect(archiveRes.status).toBe(200);
    const archiveBody = await expectJson<{ archived_page_ids: string[] }>(archiveRes);
    expect(archiveBody.archived_page_ids).toHaveLength(106);
    expect(sentIndexPageIds()).toHaveLength(106);

    vi.mocked(env.TASKS_QUEUE.sendBatch).mockClear();

    const restoreRes = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(restoreRes.status).toBe(200);
    const restoreBody = await expectJson<{ ok: true; pages: Array<{ id: string; archived_at: string | null }> }>(
      restoreRes,
    );
    expect(restoreBody.pages).toHaveLength(106);
    expect(restoreBody.pages.every((page) => page.archived_at === null)).toBe(true);
    expect(sentIndexPageIds()).toHaveLength(106);

    const rowsAfterRestore = await getDb().select().from(pages).where(eq(pages.workspace_id, ws.id));
    const archivedRows = rowsAfterRestore.filter((row) => row.archived_at !== null || row.archive_root_id !== null);
    expect(archivedRows).toEqual([]);
  });

  it("rejects a member archiving a subtree with another user's active page", async () => {
    const owner = await seedUser({ id: "owner" });
    const member = await seedUser({ id: "member" });
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const root = await seedPage({ workspace_id: ws.id, created_by: member.id });
    const child = await seedPage({ workspace_id: ws.id, created_by: owner.id, parent_id: root.id });

    const denied = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}`, {
      method: "DELETE",
      userId: member.id,
    });
    expect(denied.status).toBe(403);

    const rowsAfterDenied = await getDb().select().from(pages).where(eq(pages.workspace_id, ws.id));
    expect(rowsAfterDenied.every((row) => row.archived_at === null && row.archive_root_id === null)).toBe(true);

    const allowed = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}`, {
      method: "DELETE",
      userId: owner.id,
    });
    expect(allowed.status).toBe(200);
    const body = await expectJson<{ archived_page_ids: string[] }>(allowed);
    expect(new Set(body.archived_page_ids)).toEqual(new Set([root.id, child.id]));
  });

  it("skips already archived descendants and restore clears only the matching archive root", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const root = await seedPage({ id: "root", workspace_id: ws.id, created_by: owner.id });
    const independentlyArchived = await seedPage({
      id: "archived-child",
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: root.id,
      archived_at: "2026-04-01T00:00:00.000Z",
      archive_root_id: "archived-child",
    });

    const archiveRes = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}`, {
      method: "DELETE",
      userId: owner.id,
    });
    expect(archiveRes.status).toBe(200);
    expect((await expectJson<{ archived_page_ids: string[] }>(archiveRes)).archived_page_ids).toEqual([root.id]);

    let archivedChild = await getDb().select().from(pages).where(eq(pages.id, independentlyArchived.id)).get();
    expect(archivedChild?.archived_at).toBe("2026-04-01T00:00:00.000Z");
    expect(archivedChild?.archive_root_id).toBe(independentlyArchived.id);

    const restoreRes = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(restoreRes.status).toBe(200);
    expect((await expectJson<{ pages: Array<{ id: string }> }>(restoreRes)).pages.map((page) => page.id)).toEqual([
      root.id,
    ]);

    archivedChild = await getDb().select().from(pages).where(eq(pages.id, independentlyArchived.id)).get();
    expect(archivedChild?.archived_at).toBe("2026-04-01T00:00:00.000Z");
    expect(archivedChild?.archive_root_id).toBe(independentlyArchived.id);

    const childRestoreRes = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${independentlyArchived.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(childRestoreRes.status).toBe(200);
    archivedChild = await getDb().select().from(pages).where(eq(pages.id, independentlyArchived.id)).get();
    expect(archivedChild?.archived_at).toBeNull();
    expect(archivedChild?.archive_root_id).toBeNull();
  });

  it("scopes trash roots by workspace role and root creator", async () => {
    const owner = await seedUser({ id: "owner" });
    const member = await seedUser({ id: "member" });
    const guest = await seedUser({ id: "guest" });
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    await seedMembership({ user_id: guest.id, workspace_id: ws.id, role: "guest" });
    const ownerRoot = await seedPage({
      id: "owner-root",
      workspace_id: ws.id,
      created_by: owner.id,
      archived_at: "2026-04-01T00:00:00.000Z",
      archive_root_id: "owner-root",
    });
    const memberRoot = await seedPage({
      id: "member-root",
      workspace_id: ws.id,
      created_by: member.id,
      archived_at: "2026-04-02T00:00:00.000Z",
      archive_root_id: "member-root",
    });

    const ownerList = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/archived`, { userId: owner.id });
    expect(ownerList.status).toBe(200);
    expect((await expectJson<{ pages: Array<{ id: string }> }>(ownerList)).pages.map((page) => page.id)).toEqual([
      memberRoot.id,
      ownerRoot.id,
    ]);

    const memberList = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/archived`, { userId: member.id });
    expect(memberList.status).toBe(200);
    expect((await expectJson<{ pages: Array<{ id: string }> }>(memberList)).pages.map((page) => page.id)).toEqual([
      memberRoot.id,
    ]);

    const guestList = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/archived`, { userId: guest.id });
    expect(guestList.status).toBe(403);
  });

  it("rejects a member restoring a mixed-ownership archived operation", async () => {
    const owner = await seedUser({ id: "owner" });
    const member = await seedUser({ id: "member" });
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const root = await seedPage({
      id: "root",
      workspace_id: ws.id,
      created_by: member.id,
      archived_at: "2026-04-01T00:00:00.000Z",
      archive_root_id: "root",
    });
    const child = await seedPage({
      id: "child",
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: root.id,
      archived_at: "2026-04-01T00:00:00.000Z",
      archive_root_id: root.id,
    });

    const denied = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}/restore`, {
      method: "POST",
      userId: member.id,
    });
    expect(denied.status).toBe(403);
    expect(ApiErrorResponse.parse(await denied.json()).error).toBe("forbidden");

    const rowsAfterDenied = await getDb().select().from(pages).where(eq(pages.workspace_id, ws.id));
    expect(rowsAfterDenied.every((row) => row.archived_at !== null && row.archive_root_id === root.id)).toBe(true);

    const allowed = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(allowed.status).toBe(200);
    expect(new Set((await expectJson<{ pages: Array<{ id: string }> }>(allowed)).pages.map((page) => page.id))).toEqual(
      new Set([root.id, child.id]),
    );
  });

  it("rejects restore for non-root archived descendants and for roots under archived ancestors", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const root = await seedPage({
      id: "root",
      workspace_id: ws.id,
      created_by: owner.id,
      archived_at: "2026-04-01T00:00:00.000Z",
      archive_root_id: "root",
    });
    const child = await seedPage({
      id: "child",
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: root.id,
      archived_at: "2026-04-01T00:00:00.000Z",
      archive_root_id: root.id,
    });

    const nonRoot = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${child.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(nonRoot.status).toBe(409);
    expect(ApiErrorResponse.parse(await nonRoot.json()).error).toBe("not_archive_root");

    await getDb().update(pages).set({ archive_root_id: child.id }).where(eq(pages.id, child.id));
    const underArchivedAncestor = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${child.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(underArchivedAncestor.status).toBe(409);
    expect(ApiErrorResponse.parse(await underArchivedAncestor.json()).error).toBe("archived_ancestor");
  });

  it("ignores legacy archived rows until the operator backfill runbook is applied", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const legacy = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      archived_at: "2026-04-01T00:00:00.000Z",
      archive_root_id: null,
    });

    const listBefore = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/archived`, { userId: owner.id });
    expect(listBefore.status).toBe(200);
    expect((await expectJson<{ pages: unknown[] }>(listBefore)).pages).toEqual([]);

    const restoreBefore = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${legacy.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(restoreBefore.status).toBe(409);
    expect(ApiErrorResponse.parse(await restoreBefore.json()).error).toBe("not_archive_root");

    await getDb().run(sql`
      UPDATE pages
      SET archive_root_id = id
      WHERE archived_at IS NOT NULL
        AND archive_root_id IS NULL
    `);

    const listAfter = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/archived`, { userId: owner.id });
    expect((await expectJson<{ pages: Array<{ id: string }> }>(listAfter)).pages.map((page) => page.id)).toEqual([
      legacy.id,
    ]);

    const restoreAfter = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${legacy.id}/restore`, {
      method: "POST",
      userId: owner.id,
    });
    expect(restoreAfter.status).toBe(200);
    const restored = await getDb().select().from(pages).where(eq(pages.id, legacy.id)).get();
    expect(restored?.archived_at).toBeNull();
    expect(restored?.archive_root_id).toBeNull();
  });

  it("hides archived published descendants from Sites and serves them again after restore", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const root = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Root" });
    const child = await seedPage({ workspace_id: ws.id, created_by: owner.id, parent_id: root.id, title: "Child" });
    await seedWorkspaceSite({ workspace_id: ws.id, slug: "acme" });
    await seedPublishedPage({ workspace_id: ws.id, page_id: root.id, published_by: owner.id });
    await projectSitePage(env, child.id);

    await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}`, { method: "DELETE", userId: owner.id });

    const hidden = await apiRequest(buildSitePagePath(child.id, "Child"), { origin: SITE_ORIGIN });
    expect(hidden.status).toBe(404);

    await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${root.id}/restore`, { method: "POST", userId: owner.id });

    const visible = await apiRequest(buildSitePagePath(child.id, "Child"), { origin: SITE_ORIGIN });
    expect(visible.status).toBe(200);
    expect(await visible.text()).toContain("<title>Child</title>");
  });

  it("conceals page-scoped uploads while archived and serves them again after restore", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const upload = await seedUpload({
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: page.id,
      r2_key: "uploads/archive-restore.png",
      content_type: "image/png",
    });
    await env.R2.put(upload.r2_key, new Uint8Array([1, 2, 3]));
    const cookie = await refreshCookieFor(owner.id);

    await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}`, { method: "DELETE", userId: owner.id });

    const hidden = await apiRequest(`/uploads/${upload.id}`, { cookie });
    expect(hidden.status).toBe(404);

    await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/restore`, { method: "POST", userId: owner.id });

    const visible = await apiRequest(`/uploads/${upload.id}`, { cookie });
    expect(visible.status).toBe(200);
    expect(visible.headers.get("content-type")).toContain("image/png");
  });
});
