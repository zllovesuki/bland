import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { buildYjsDocBytes, seedDocSyncSnapshot } from "@tests/worker/helpers/do";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

describe("GET /workspaces/:wid/pages/:id/snapshot", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("streams the persisted snapshot bytes for full workspace members", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });
    const snapshotBytes = buildYjsDocBytes("Alpha", "The quick brown fox.");
    await seedDocSyncSnapshot(page.id, snapshotBytes);

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/snapshot`, {
      userId: member.id,
    });

    expect(res.status).toBe(200);
    const served = new Uint8Array(await res.arrayBuffer());
    expect(served.length).toBe(snapshotBytes.length);
    expect(Array.from(served)).toEqual(Array.from(snapshotBytes));
  });

  it("returns 204 when no persisted snapshot exists yet", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/snapshot`, {
      userId: member.id,
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("serves the snapshot for an anonymous caller presenting a valid share token", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-snapshot",
      permission: "view",
    });
    const snapshotBytes = buildYjsDocBytes("Title", "Shared view body.");
    await seedDocSyncSnapshot(page.id, snapshotBytes);

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/snapshot`, {
      shareToken: "tok-snapshot",
    });

    expect(res.status).toBe(200);
    const served = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(served)).toEqual(Array.from(snapshotBytes));
  });

  it("returns 404 (no existence leak) for a stranger with no access", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Title", "body"));

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/snapshot`, {
      userId: stranger.id,
    });

    expect(res.status).toBe(404);
  });
});
