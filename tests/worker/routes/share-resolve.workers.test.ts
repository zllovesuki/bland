import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

type ShareResolveResponse = {
  page_id: string;
  workspace_id: string;
  permission: "view" | "edit";
  token: string;
  viewer: {
    access_mode: "member" | "shared";
    principal_type: "user" | "link";
    route_kind: "canonical" | "shared";
    workspace_slug: string | null;
    workspace_role: "owner" | "admin" | "member" | "guest" | null;
  };
};

describe("GET /share/:token", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns link-scoped viewer metadata for an anonymous visitor", async () => {
    const owner = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id, slug: "demo" });
    const page = await seedPage({ workspace_id: workspace.id, created_by: owner.id, title: "Alpha" });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-anonymous",
      permission: "view",
    });

    const res = await apiRequest("/api/v1/share/tok-anonymous");
    expect(res.status).toBe(200);

    const body = (await res.json()) as ShareResolveResponse;
    expect(body).toMatchObject({
      page_id: page.id,
      permission: "view",
      token: "tok-anonymous",
      viewer: {
        access_mode: "shared",
        principal_type: "link",
        route_kind: "shared",
        workspace_slug: null,
        workspace_role: null,
      },
    });
  });

  it("keeps viewer metadata link-scoped even when the caller is a member of the workspace", async () => {
    const owner = await seedUser();
    const memberCaller = await seedUser();
    const workspace = await seedWorkspace({ owner_id: owner.id, slug: "demo" });
    await seedMembership({ user_id: memberCaller.id, workspace_id: workspace.id, role: "member" });
    const page = await seedPage({ workspace_id: workspace.id, created_by: owner.id, title: "Alpha" });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-member-visits-share",
      permission: "view",
    });

    const res = await apiRequest("/api/v1/share/tok-member-visits-share", {
      userId: memberCaller.id,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ShareResolveResponse;
    expect(body.viewer).toEqual({
      access_mode: "shared",
      principal_type: "link",
      route_kind: "shared",
      workspace_slug: null,
      workspace_role: null,
    });
    expect(body.permission).toBe("view");
  });

  it("returns 404 for unknown tokens", async () => {
    const res = await apiRequest("/api/v1/share/does-not-exist");
    expect(res.status).toBe(404);
  });
});
