import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { PROD_ORIGIN, apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";
import { buildYjsDocBytes, seedDocSyncSnapshot } from "@tests/worker/helpers/do";

const REWRITE_PAYLOAD = {
  action: "proofread",
  selectedText: "hi",
  parentBlock: "hi",
  beforeBlock: "",
  afterBlock: "",
  pageTitle: "",
};

describe("AI route entitlement gating", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns 401 when no principal can be resolved", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      origin: PROD_ORIGIN,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 ai_not_entitled for a non-member canonical viewer with share access attempting rewrite", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: outsider.id,
      permission: "view",
    });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      userId: outsider.id,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ai_not_entitled");
  });

  it("denies every AI action for a guest on canonical surface even with edit share access", async () => {
    const owner = await seedUser();
    const guest = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: guest.id, workspace_id: ws.id, role: "guest" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: guest.id,
      permission: "edit",
    });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Page", "Hello body"));

    const cases: Array<{ path: string; body?: unknown }> = [
      { path: `/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, body: REWRITE_PAYLOAD },
      {
        path: `/api/v1/workspaces/${ws.id}/pages/${page.id}/generate`,
        body: { intent: "continue", beforeBlock: "", afterBlock: "", pageTitle: "" },
      },
      { path: `/api/v1/workspaces/${ws.id}/pages/${page.id}/summarize` },
      { path: `/api/v1/workspaces/${ws.id}/pages/${page.id}/ask`, body: { question: "What is this?" } },
    ];

    for (const { path, body } of cases) {
      const res = await apiRequest(path, {
        method: "POST",
        body: body as never,
        userId: guest.id,
      });
      expect(res.status, `guest should be denied on ${path}`).toBe(403);
      const payload = (await res.json()) as { error: string };
      expect(payload.error).toBe("ai_not_entitled");
    }
  });

  it("full members keep edit entitlement even when they also carry a redundant view-only user share", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "user",
      grantee_id: member.id,
      permission: "view",
    });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      userId: member.id,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("allows a canonical member to summarize a page with body text", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Page", "This is the body."));

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/summarize`, {
      method: "POST",
      userId: member.id,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { summary: string };
    expect(typeof body.summary).toBe("string");
    expect(body.summary.length).toBeGreaterThan(0);
  });

  it("allows a canonical editor (full member) to rewrite and streams SSE", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      userId: member.id,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
  });

  it("returns 404 not_found when the page does not exist", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/page-does-not-exist/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      userId: owner.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 404 not_found when access level is none (no existence leak)", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      userId: outsider.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 404 not_found for an inaccessible canvas page (no kind leak)", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, kind: "canvas" });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      userId: outsider.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 404 page_empty for an accessible canvas page (kind check after access)", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, kind: "canvas" });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/rewrite`, {
      method: "POST",
      body: REWRITE_PAYLOAD,
      userId: member.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("page_empty");
  });
});

describe("AI empty-page gating", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns 404 page_empty on /ask when the page body is empty (no snapshot)", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/ask`, {
      method: "POST",
      body: { question: "What is this?" },
      userId: member.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("page_empty");
  });

  it("returns 404 page_empty on /summarize when the page body is empty (no snapshot)", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/summarize`, {
      method: "POST",
      userId: member.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("page_empty");
  });

  it("returns 404 page_empty on /ask when the DocSync snapshot exists but body is empty", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedDocSyncSnapshot(page.id, buildYjsDocBytes("Title only", ""));

    const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}/ask`, {
      method: "POST",
      body: { question: "hi" },
      userId: member.id,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("page_empty");
  });
});
