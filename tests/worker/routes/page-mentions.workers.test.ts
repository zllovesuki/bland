import { beforeEach, describe, expect, it } from "vitest";

import { ResolvePageMentionsResponse } from "@/shared/types";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { PROD_ORIGIN, apiRequest } from "@tests/worker/helpers/request";
import { ApiErrorResponse } from "@tests/worker/helpers/schemas";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function postResolve(
  workspaceId: string,
  body: { page_ids: string[] },
  opts: { userId?: string; shareToken?: string; origin?: string } = {},
) {
  return apiRequest(`/api/v1/workspaces/${workspaceId}/page-mentions/resolve`, {
    method: "POST",
    body,
    userId: opts.userId,
    shareToken: opts.shareToken,
    origin: opts.origin,
  });
}

describe("POST /workspaces/:wid/page-mentions/resolve", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("resolves accessible pages for a full member", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const alpha = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha", icon: "A" });
    const beta = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Beta" });

    const res = await postResolve(ws.id, { page_ids: [alpha.id, beta.id] }, { userId: member.id });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([
      { page_id: alpha.id, accessible: true, title: "Alpha", icon: "A" },
      { page_id: beta.id, accessible: true, title: "Beta", icon: null },
    ]);
  });

  it("resolves shared-link mentions when the principal is a link token", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-link",
      permission: "view",
    });

    const res = await postResolve(ws.id, { page_ids: [page.id] }, { shareToken: "tok-link" });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions[0].accessible).toBe(true);
  });

  it("keeps full-member access when a member request also carries ?share=", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-combo",
      permission: "view",
    });

    const res = await postResolve(ws.id, { page_ids: [page.id] }, { userId: member.id, shareToken: "tok-combo" });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions[0].accessible).toBe(true);
  });

  it("resolves canonical user-grantee shared access without a share token", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: outsider.id,
      permission: "view",
    });

    const res = await postResolve(ws.id, { page_ids: [page.id] }, { userId: outsider.id });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions[0].accessible).toBe(true);
  });

  it("collapses inaccessible ids to restricted without leaking title or icon", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const visible = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha", icon: "A" });
    const blocked = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Secret" });
    await seedPageShare({
      page_id: visible.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-restrict",
      permission: "view",
    });

    const res = await postResolve(ws.id, { page_ids: [visible.id, blocked.id] }, { shareToken: "tok-restrict" });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([
      { page_id: visible.id, accessible: true, title: "Alpha", icon: "A" },
      { page_id: blocked.id, accessible: false, title: null, icon: null },
    ]);
  });

  it("collapses archived accessible pages to restricted mention entries", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const archived = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Tombstone",
      archived_at: "2026-04-01T00:00:00.000Z",
    });

    const res = await postResolve(ws.id, { page_ids: [archived.id] }, { userId: member.id });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([{ page_id: archived.id, accessible: false, title: null, icon: null }]);
  });

  it("returns 404 when the workspace does not exist", async () => {
    const caller = await seedUser();

    const res = await postResolve("ws-unknown", { page_ids: ["p-1"] }, { userId: caller.id });
    expect(res.status).toBe(404);
    expect(ApiErrorResponse.parse(await res.json()).error).toBe("not_found");
  });

  it("returns 401 when no principal can be resolved (anonymous, no share token)", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });

    const res = await postResolve(ws.id, { page_ids: ["p-1"] }, { origin: PROD_ORIGIN });
    expect(res.status).toBe(401);
  });

  it("rejects batches larger than the cap", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });

    const ids = Array.from({ length: 101 }, (_, i) => `p-${i.toString().padStart(3, "0")}`);
    const res = await postResolve(ws.id, { page_ids: ids }, { userId: member.id });
    expect(res.status).toBe(400);
  });

  it("dedupes duplicate ids and only resolves unique ones", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });

    const res = await postResolve(ws.id, { page_ids: [page.id, page.id, page.id] }, { userId: member.id });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toHaveLength(1);
    expect(body.mentions[0].page_id).toBe(page.id);
  });

  it("collapses unknown ids to restricted instead of rejecting the whole batch", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const known = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Alpha" });
    const unknownId = "page-unknown";

    const res = await postResolve(ws.id, { page_ids: [known.id, unknownId] }, { userId: member.id });
    expect(res.status).toBe(200);
    const body = ResolvePageMentionsResponse.parse(await res.json());
    expect(body.mentions).toEqual([
      { page_id: known.id, accessible: true, title: "Alpha", icon: null },
      { page_id: unknownId, accessible: false, title: null, icon: null },
    ]);
  });
});
