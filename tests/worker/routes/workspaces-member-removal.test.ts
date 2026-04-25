import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { memberships, pageShares } from "@/worker/db/d1/schema";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

describe("DELETE /workspaces/:id/members/:uid", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("atomically deletes user-grantee page_shares and the membership row when an admin removes a member", async () => {
    const admin = await seedUser();
    const member = await seedUser();
    const other = await seedUser();
    const workspace = await seedWorkspace({ owner_id: admin.id, seedOwnerMembership: false });
    await seedMembership({ user_id: admin.id, workspace_id: workspace.id, role: "admin" });
    await seedMembership({ user_id: member.id, workspace_id: workspace.id, role: "member" });

    const page = await seedPage({ workspace_id: workspace.id, created_by: admin.id });
    const grantToRemovedMember = await seedPageShare({
      page_id: page.id,
      created_by: admin.id,
      grantee_type: "user",
      grantee_id: member.id,
      permission: "edit",
    });
    const grantToOtherUser = await seedPageShare({
      page_id: page.id,
      created_by: admin.id,
      grantee_type: "user",
      grantee_id: other.id,
      permission: "view",
    });
    const linkShare = await seedPageShare({
      page_id: page.id,
      created_by: admin.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "share-token-abc",
      permission: "view",
    });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${member.id}`, {
      method: "DELETE",
      userId: admin.id,
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const db = getDb();
    const remainingMembership = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.user_id, member.id), eq(memberships.workspace_id, workspace.id)))
      .get();
    expect(remainingMembership).toBeUndefined();

    const remainingRemovedMemberShare = await db
      .select()
      .from(pageShares)
      .where(eq(pageShares.id, grantToRemovedMember.id))
      .get();
    expect(remainingRemovedMemberShare).toBeUndefined();

    const remainingOtherShare = await db.select().from(pageShares).where(eq(pageShares.id, grantToOtherUser.id)).get();
    expect(remainingOtherShare).toBeDefined();

    const remainingLinkShare = await db.select().from(pageShares).where(eq(pageShares.id, linkShare.id)).get();
    expect(remainingLinkShare).toBeDefined();
  });

  it("refuses to remove the workspace owner", async () => {
    const owner = await seedUser();
    const admin = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: admin.id, workspace_id: workspace.id, role: "admin" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${owner.id}`, {
      method: "DELETE",
      userId: admin.id,
    });

    expect(res.status).toBe(403);

    const db = getDb();
    const ownerMembership = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.user_id, owner.id), eq(memberships.workspace_id, workspace.id)))
      .get();
    expect(ownerMembership?.role).toBe("owner");
  });

  it("refuses self-removal from the owner role", async () => {
    const owner = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${owner.id}`, {
      method: "DELETE",
      userId: owner.id,
    });

    expect(res.status).toBe(403);

    const db = getDb();
    const ownerMembership = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.user_id, owner.id), eq(memberships.workspace_id, workspace.id)))
      .get();
    expect(ownerMembership?.role).toBe("owner");
  });

  it("allows a guest to leave and clears their user-grantee shares", async () => {
    const owner = await seedUser();
    const guest = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: guest.id, workspace_id: workspace.id, role: "guest" });

    const page = await seedPage({ workspace_id: workspace.id, created_by: owner.id });
    const grantToGuest = await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: guest.id,
      permission: "view",
    });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${guest.id}`, {
      method: "DELETE",
      userId: guest.id,
    });

    expect(res.status).toBe(200);

    const db = getDb();
    const remainingMembership = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.user_id, guest.id), eq(memberships.workspace_id, workspace.id)))
      .get();
    expect(remainingMembership).toBeUndefined();

    const remainingShare = await db.select().from(pageShares).where(eq(pageShares.id, grantToGuest.id)).get();
    expect(remainingShare).toBeUndefined();
  });

  it("rejects a non-admin member trying to remove someone else", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const victim = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: workspace.id, role: "member" });
    await seedMembership({ user_id: victim.id, workspace_id: workspace.id, role: "member" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${victim.id}`, {
      method: "DELETE",
      userId: member.id,
    });

    expect(res.status).toBe(403);

    const db = getDb();
    const victimMembership = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.user_id, victim.id), eq(memberships.workspace_id, workspace.id)))
      .get();
    expect(victimMembership?.role).toBe("member");
  });
});
