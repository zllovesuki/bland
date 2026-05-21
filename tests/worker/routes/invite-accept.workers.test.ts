import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { invites, memberships } from "@/worker/db/d1/schema";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest, PROD_ORIGIN } from "@tests/worker/helpers/request";
import { seedInvite, seedMembership, seedTesseraIdentity, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

interface AcceptResponse {
  workspace_id: string;
  accessToken: string;
  already_member?: boolean;
}

describe("POST /invite/:token/accept - conditional acceptance gate", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("only one of two concurrent acceptances writes a membership row", async () => {
    const inviter = await seedUser();
    const userA = await seedUser();
    const userB = await seedUser();
    await seedTesseraIdentity({ sub: "sub-a", user_id: userA.id });
    await seedTesseraIdentity({ sub: "sub-b", user_id: userB.id });
    const ws = await seedWorkspace({ owner_id: inviter.id });
    const invite = await seedInvite({
      workspace_id: ws.id,
      invited_by: inviter.id,
      role: "member",
      email: null,
      accepted_at: null,
      revoked_at: null,
    });

    const [resA, resB] = await Promise.all([
      apiRequest(`/api/v1/invite/${invite.token}/accept`, {
        method: "POST",
        userId: userA.id,
        body: {},
      }),
      apiRequest(`/api/v1/invite/${invite.token}/accept`, {
        method: "POST",
        userId: userB.id,
        body: {},
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 410]);

    const memberRows = await getDb()
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspace_id, ws.id), inArray(memberships.user_id, [userA.id, userB.id])))
      .all();
    expect(memberRows).toHaveLength(1);

    const finalInvite = await getDb().select().from(invites).where(eq(invites.id, invite.id)).get();
    expect(finalInvite?.accepted_by).toBe(memberRows[0].user_id);
    expect(finalInvite?.accepted_at).not.toBeNull();
  });

  it("returns 200 already_member when an existing member accepts an open invite", async () => {
    const inviter = await seedUser();
    const member = await seedUser();
    const ws = await seedWorkspace({ owner_id: inviter.id });
    await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
    const invite = await seedInvite({
      workspace_id: ws.id,
      invited_by: inviter.id,
      role: "member",
      email: null,
    });

    const res = await apiRequest(`/api/v1/invite/${invite.token}/accept`, {
      method: "POST",
      userId: member.id,
      body: {},
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as AcceptResponse;
    expect(body.already_member).toBe(true);

    const memberRows = await getDb()
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspace_id, ws.id), eq(memberships.user_id, member.id)))
      .all();
    expect(memberRows).toHaveLength(1);
  });

  it("returns 410 gone for an already-accepted invite without overwriting accepted_by", async () => {
    const inviter = await seedUser();
    const winner = await seedUser();
    const loser = await seedUser();
    const ws = await seedWorkspace({ owner_id: inviter.id });
    await seedMembership({ user_id: winner.id, workspace_id: ws.id, role: "member" });
    const invite = await seedInvite({
      workspace_id: ws.id,
      invited_by: inviter.id,
      role: "member",
      email: null,
      accepted_at: "2026-04-23T00:00:00.000Z",
      accepted_by: winner.id,
    });

    const res = await apiRequest(`/api/v1/invite/${invite.token}/accept`, {
      method: "POST",
      userId: loser.id,
      body: {},
    });

    expect(res.status).toBe(410);
  });

  it("returns 410 for a revoked invite without writing membership or accepted state", async () => {
    const inviter = await seedUser();
    const caller = await seedUser();
    const ws = await seedWorkspace({ owner_id: inviter.id });
    const invite = await seedInvite({
      workspace_id: ws.id,
      invited_by: inviter.id,
      role: "member",
      email: null,
      revoked_at: "2026-04-22T00:00:00.000Z",
    });

    const res = await apiRequest(`/api/v1/invite/${invite.token}/accept`, {
      method: "POST",
      userId: caller.id,
      body: {},
    });

    expect(res.status).toBe(410);
  });

  it("returns 410 for an expired invite", async () => {
    const inviter = await seedUser();
    const caller = await seedUser();
    const ws = await seedWorkspace({ owner_id: inviter.id });
    const invite = await seedInvite({
      workspace_id: ws.id,
      invited_by: inviter.id,
      role: "member",
      email: null,
      expires_at: "2020-01-01T00:00:00.000Z",
    });

    const res = await apiRequest(`/api/v1/invite/${invite.token}/accept`, {
      method: "POST",
      userId: caller.id,
      body: {},
    });

    expect(res.status).toBe(410);
  });

  it("rejects unauthenticated callers under production origin", async () => {
    const inviter = await seedUser();
    const ws = await seedWorkspace({ owner_id: inviter.id });
    const invite = await seedInvite({ workspace_id: ws.id, invited_by: inviter.id, role: "member", email: null });

    const res = await apiRequest(`/api/v1/invite/${invite.token}/accept`, {
      method: "POST",
      origin: PROD_ORIGIN,
      body: {},
    });

    expect(res.status).toBe(401);
  });

  it("rejects an email-pinned invite when the authenticated email does not match", async () => {
    const inviter = await seedUser();
    const caller = await seedUser({ email: "other@example.com" });
    const ws = await seedWorkspace({ owner_id: inviter.id });
    const invite = await seedInvite({
      workspace_id: ws.id,
      invited_by: inviter.id,
      role: "member",
      email: "pinned@example.com",
    });

    const res = await apiRequest(`/api/v1/invite/${invite.token}/accept`, {
      method: "POST",
      userId: caller.id,
      body: {},
    });

    expect(res.status).toBe(403);
  });
});
