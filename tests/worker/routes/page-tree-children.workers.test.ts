import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

interface ChildrenResponse {
  pages: Array<{ id: string; title: string }>;
}

describe("GET /workspaces/:wid/pages/:id/children - access gating", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns 401 when no principal can be resolved", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/children`, {
      origin: "https://bland.test",
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 not_found for a missing parent (member caller)", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/page-does-not-exist/children`, {
      userId: owner.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 404 not_found for an inaccessible existing parent (no existence leak)", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/children`, {
      userId: outsider.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 200 with empty pages when accessible parent has no children", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const parent = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${parent.id}/children`, {
      userId: owner.id,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChildrenResponse;
    expect(body.pages).toEqual([]);
  });

  it("returns inherited children for a shared-link viewer when no nested share replaces inheritance", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const parent = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Parent" });
    await seedPageShare({
      page_id: parent.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tokA",
      permission: "view",
    });
    const childA = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: parent.id,
      title: "Inherited Child A",
      position: 1,
    });
    const childB = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: parent.id,
      title: "Replaced Child B",
      position: 2,
    });
    // B has its own share row for a different token: replace-not-merge means B's
    // nearest share is itself, which has no row matching `tokA` → none for tokA.
    await seedPageShare({
      page_id: childB.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tokB",
      permission: "view",
    });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${parent.id}/children`, {
      shareToken: "tokA",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChildrenResponse;
    const ids = body.pages.map((p) => p.id);
    expect(ids).toEqual([childA.id]);
    expect(ids).not.toContain(childB.id);
  });

  it("returns the replaced child for a viewer holding the matching nested token", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const parent = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Parent" });
    await seedPageShare({
      page_id: parent.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tokA",
      permission: "view",
    });
    const childA = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: parent.id,
      title: "Inherited Child A",
      position: 1,
    });
    const childB = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      parent_id: parent.id,
      title: "Direct-share Child B",
      position: 2,
    });
    await seedPageShare({
      page_id: childB.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tokB",
      permission: "view",
    });
    // Sanity counter: with tokB the parent is reachable through B's grant only if
    // B itself is the requested parent; here we request the original parent so a
    // tokB viewer should see 404 (no access on the parent page itself).
    const resOnParent = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${parent.id}/children`, {
      shareToken: "tokB",
    });
    expect(resOnParent.status).toBe(404);

    // Requesting children of B itself with tokB should succeed.
    const resOnB = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${childB.id}/children`, {
      shareToken: "tokB",
    });
    expect(resOnB.status).toBe(200);
    void childA;
  });
});
