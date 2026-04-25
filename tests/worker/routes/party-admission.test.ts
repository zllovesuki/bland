import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { PROD_ORIGIN, apiRequest } from "@tests/worker/helpers/request";
import { bearerFor } from "@tests/worker/helpers/auth";
import { createAccessToken } from "@/worker/lib/auth";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function upgradeRequest(
  pageId: string,
  params: { token?: string; share?: string; origin?: string; originHeader?: string } = {},
): Promise<Response> {
  const search: Record<string, string> = {};
  if (params.token) search.token = params.token;
  if (params.share) search.share = params.share;
  return apiRequest(`/parties/doc-sync/${pageId}`, {
    origin: params.origin ?? PROD_ORIGIN,
    search,
    headers: {
      upgrade: "websocket",
      connection: "upgrade",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-version": "13",
      ...(params.originHeader ? { origin: params.originHeader } : {}),
    },
  });
}

async function accessTokenFor(userId: string): Promise<string> {
  const header = await bearerFor(userId);
  return header.replace(/^Bearer\s+/, "");
}

describe("routePartykitRequest: DocSync onBeforeConnect admission", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("rejects requests with no token and no share with 401", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await upgradeRequest(page.id);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Authentication required");
  });

  it("rejects requests with an unknown page id with 404", async () => {
    const owner = await seedUser();
    const token = await accessTokenFor(owner.id);

    const res = await upgradeRequest("page-unknown", { token });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Page not found");
  });

  it("rejects requests for an archived page with 404", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({
      workspace_id: ws.id,
      created_by: owner.id,
      archived_at: "2026-04-01T00:00:00.000Z",
    });
    const token = await accessTokenFor(owner.id);

    const res = await upgradeRequest(page.id, { token });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Page not found");
  });

  it("rejects requests with an invalid bearer token with 401", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await upgradeRequest(page.id, { token: "not-a-valid-jwt" });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid token");
  });

  it("rejects requests for a token referring to a user that does not exist with 401", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const ghostToken = await createAccessToken("user-does-not-exist", env);

    const res = await upgradeRequest(page.id, { token: ghostToken });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid token");
  });

  it("rejects a user with no membership and no share with 403", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const token = await accessTokenFor(outsider.id);

    const res = await upgradeRequest(page.id, { token });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("You do not have access to this page");
  });

  it("rejects an unknown share token with 403 and the shared-surface message", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    const res = await upgradeRequest(page.id, { share: "tok-not-real" });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Invalid or expired share link");
  });

  it("rejects browser-declared disallowed origins with 403 before any DB lookups", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const token = await accessTokenFor(owner.id);

    const res = await upgradeRequest(page.id, { token, originHeader: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden origin");
  });

  it("admits full workspace members with a 101 switching-protocols response carrying a WebSocket", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const token = await accessTokenFor(member.id);

    const res = await upgradeRequest(page.id, { token });

    expect(res.status).toBe(101);
    expect(res.webSocket).toBeTruthy();
    res.webSocket?.accept();
    res.webSocket?.close(1000, "test-cleanup");
  });

  it("admits shared viewers presenting a valid link token", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    await seedPageShare({
      page_id: page.id,
      created_by: owner.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "tok-view-admit",
      permission: "view",
    });

    const res = await upgradeRequest(page.id, { share: "tok-view-admit" });

    expect(res.status).toBe(101);
    expect(res.webSocket).toBeTruthy();
    res.webSocket?.accept();
    res.webSocket?.close(1000, "test-cleanup");
  });
});
