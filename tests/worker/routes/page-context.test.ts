import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

type ContextResponse = {
  workspace: { id: string; slug: string; name: string };
  viewer: {
    access_mode: "member" | "shared";
    principal_type: "user" | "link";
    route_kind: "canonical" | "shared";
    workspace_slug: string | null;
    workspace_role: "owner" | "admin" | "member" | "guest" | null;
  };
};

describe("GET /pages/:id/context", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns canonical member viewer metadata with writer workspace_role for full members", async () => {
    const owner = await seedUser();
    const memberCaller = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id, slug: "demo" });
    await seedMembership({ user_id: memberCaller.id, workspace_id: workspace.id, role: "member" });
    const page = await seedPage({ workspace_id: workspace.id, created_by: owner.id, title: "Alpha" });

    const res = await apiRequest(`/api/v1/pages/${page.id}/context`, { userId: memberCaller.id });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ContextResponse;
    expect(body.workspace).toMatchObject({ id: workspace.id, slug: "demo" });
    expect(body.viewer).toMatchObject({
      access_mode: "member",
      principal_type: "user",
      route_kind: "canonical",
      workspace_slug: "demo",
      workspace_role: "member",
    });
  });

  it("emits access_mode member with guest role for a canonical guest with a direct user share", async () => {
    const owner = await seedUser();
    const guestCaller = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id, slug: "demo" });
    await seedMembership({ user_id: guestCaller.id, workspace_id: workspace.id, role: "guest" });
    const page = await seedPage({ workspace_id: workspace.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: guestCaller.id,
      permission: "view",
    });

    const res = await apiRequest(`/api/v1/pages/${page.id}/context`, { userId: guestCaller.id });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ContextResponse;
    expect(body.viewer).toMatchObject({
      access_mode: "member",
      workspace_role: "guest",
    });
  });

  it("emits access_mode shared with null workspace_role for canonical share-only access (no workspace membership)", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id, slug: "demo" });
    const page = await seedPage({ workspace_id: workspace.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: outsider.id,
      permission: "view",
    });

    const res = await apiRequest(`/api/v1/pages/${page.id}/context`, { userId: outsider.id });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ContextResponse;
    expect(body.workspace).toMatchObject({ id: workspace.id, slug: "demo" });
    expect(body.viewer).toMatchObject({
      access_mode: "shared",
      principal_type: "user",
      route_kind: "canonical",
      workspace_slug: "demo",
      workspace_role: null,
    });
  });

  it("returns 403 when the caller has neither membership nor any share grant", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id, slug: "demo" });
    const page = await seedPage({ workspace_id: workspace.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/pages/${page.id}/context`, { userId: stranger.id });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the page does not exist", async () => {
    const caller = await seedUser();
    const res = await apiRequest(`/api/v1/pages/page-does-not-exist/context`, { userId: caller.id });
    expect(res.status).toBe(404);
  });
});
