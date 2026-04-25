import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

describe("GET /workspaces/:id/members", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns the full roster for owner/admin/member callers", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const guest = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: workspace.id, role: "member" });
    await seedMembership({ user_id: guest.id, workspace_id: workspace.id, role: "guest" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members`, {
      userId: member.id,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: Array<{ user_id: string; role: string }> };
    expect(body.members.map((m) => m.user_id).sort()).toEqual([guest.id, member.id, owner.id].sort());
  });

  it("returns a self-only projection for guest callers", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const guest = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: workspace.id, role: "member" });
    await seedMembership({ user_id: guest.id, workspace_id: workspace.id, role: "guest" });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members`, {
      userId: guest.id,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: Array<{ user_id: string; role: string }> };
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ user_id: guest.id, role: "guest" });
  });

  it("rejects non-members with 403", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${workspace.id}/members`, {
      userId: outsider.id,
    });

    expect(res.status).toBe(403);
  });
});
