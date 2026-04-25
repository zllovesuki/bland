import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { memberships } from "@/worker/db/d1/schema";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function roleOf(userId: string, workspaceId: string) {
  const row = await getDb()
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.user_id, userId), eq(memberships.workspace_id, workspaceId)))
    .get();
  return row?.role ?? null;
}

describe("PATCH /workspaces/:id/members/:uid - role management", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("lets the owner promote a member to admin", async () => {
    const owner = await seedUser();
    const target = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: target.id, workspace_id: workspace.id, role: "member" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${target.id}`, {
      method: "PATCH",
      userId: owner.id,
      body: { role: "admin" },
    });

    expect(res.status).toBe(200);
    expect(await roleOf(target.id, workspace.id)).toBe("admin");
  });

  it("blocks an admin from promoting another member to admin", async () => {
    const owner = await seedUser();
    const admin = await seedUser();
    const target = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: admin.id, workspace_id: workspace.id, role: "admin" });
    await seedMembership({ user_id: target.id, workspace_id: workspace.id, role: "member" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${target.id}`, {
      method: "PATCH",
      userId: admin.id,
      body: { role: "admin" },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/Only the owner/);
    expect(await roleOf(target.id, workspace.id)).toBe("member");
  });

  it("lets an admin demote a member to guest", async () => {
    const owner = await seedUser();
    const admin = await seedUser();
    const target = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: admin.id, workspace_id: workspace.id, role: "admin" });
    await seedMembership({ user_id: target.id, workspace_id: workspace.id, role: "member" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${target.id}`, {
      method: "PATCH",
      userId: admin.id,
      body: { role: "guest" },
    });

    expect(res.status).toBe(200);
    expect(await roleOf(target.id, workspace.id)).toBe("guest");
  });

  it("refuses to change the owner's role", async () => {
    const owner = await seedUser();
    const admin = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: admin.id, workspace_id: workspace.id, role: "admin" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${owner.id}`, {
      method: "PATCH",
      userId: admin.id,
      body: { role: "member" },
    });

    expect(res.status).toBe(403);
    expect(await roleOf(owner.id, workspace.id)).toBe("owner");
  });

  it("rejects members and guests from changing roles", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const victim = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: workspace.id, role: "member" });
    await seedMembership({ user_id: victim.id, workspace_id: workspace.id, role: "member" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members/${victim.id}`, {
      method: "PATCH",
      userId: member.id,
      body: { role: "guest" },
    });

    expect(res.status).toBe(403);
    expect(await roleOf(victim.id, workspace.id)).toBe("member");
  });
});
