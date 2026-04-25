import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { invites, memberships, users } from "@/worker/db/d1/schema";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedInvite, seedMembership, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

interface AcceptResponse {
  workspace_id: string;
  accessToken: string;
  already_member?: boolean;
  is_new_user?: boolean;
}

describe("POST /invite/:token/accept - conditional acceptance gate", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("only one of two concurrent acceptances writes a membership row", async () => {
    const inviter = await seedUser();
    const userA = await seedUser();
    const userB = await seedUser();
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
        body: { turnstileToken: "ok" },
      }),
      apiRequest(`/api/v1/invite/${invite.token}/accept`, {
        method: "POST",
        userId: userB.id,
        body: { turnstileToken: "ok" },
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
      body: { turnstileToken: "ok" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as AcceptResponse;
    expect(body.already_member).toBe(true);

    // Membership count for this user/workspace pair stays at one.
    const memberRows = await getDb()
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspace_id, ws.id), eq(memberships.user_id, member.id)))
      .all();
    expect(memberRows).toHaveLength(1);

    const finalInvite = await getDb().select().from(invites).where(eq(invites.id, invite.id)).get();
    expect(finalInvite?.accepted_by).toBe(member.id);
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
      body: { turnstileToken: "ok" },
    });

    expect(res.status).toBe(410);

    const memberRows = await getDb()
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspace_id, ws.id), eq(memberships.user_id, loser.id)))
      .all();
    expect(memberRows).toHaveLength(0);

    const finalInvite = await getDb().select().from(invites).where(eq(invites.id, invite.id)).get();
    expect(finalInvite?.accepted_by).toBe(winner.id);
    expect(finalInvite?.accepted_at).toBe("2026-04-23T00:00:00.000Z");
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
      body: { turnstileToken: "ok" },
    });

    expect(res.status).toBe(410);

    const memberRows = await getDb()
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspace_id, ws.id), eq(memberships.user_id, caller.id)))
      .all();
    expect(memberRows).toHaveLength(0);

    const finalInvite = await getDb().select().from(invites).where(eq(invites.id, invite.id)).get();
    expect(finalInvite?.accepted_by).toBeNull();
    expect(finalInvite?.accepted_at).toBeNull();
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
      body: { turnstileToken: "ok" },
    });

    expect(res.status).toBe(410);

    const finalInvite = await getDb().select().from(invites).where(eq(invites.id, invite.id)).get();
    expect(finalInvite?.accepted_by).toBeNull();
    expect(finalInvite?.accepted_at).toBeNull();
  });

  it(
    "two concurrent new-user acceptances produce one membership and at most one new user with a workspace seat",
    { timeout: 30_000 },
    async () => {
      const inviter = await seedUser();
      const ws = await seedWorkspace({ owner_id: inviter.id });
      const invite = await seedInvite({
        workspace_id: ws.id,
        invited_by: inviter.id,
        role: "member",
        email: null,
        accepted_at: null,
        revoked_at: null,
      });

      const emailA = "racea@example.com";
      const emailB = "raceb@example.com";

      const [resA, resB] = await Promise.all([
        apiRequest(`/api/v1/invite/${invite.token}/accept`, {
          method: "POST",
          body: { turnstileToken: "ok", email: emailA, password: "racepwordA12", name: "Race A" },
        }),
        apiRequest(`/api/v1/invite/${invite.token}/accept`, {
          method: "POST",
          body: { turnstileToken: "ok", email: emailB, password: "racepwordB34", name: "Race B" },
        }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses[1]).toBe(410);
      // The winning response is 200 (existing user path is unreachable here) or 201 (new user)
      expect([200, 201]).toContain(statuses[0]);

      const userRows = await getDb()
        .select()
        .from(users)
        .where(inArray(users.email, [emailA, emailB]))
        .all();
      // Both pre-batch user inserts may complete (validateInviteState passes for both before either batch runs).
      expect(userRows.length).toBeGreaterThanOrEqual(1);

      const memberRows = await getDb()
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspace_id, ws.id),
            inArray(
              memberships.user_id,
              userRows.map((u) => u.id),
            ),
          ),
        )
        .all();
      expect(memberRows).toHaveLength(1);

      const finalInvite = await getDb().select().from(invites).where(eq(invites.id, invite.id)).get();
      expect(finalInvite?.accepted_by).toBe(memberRows[0].user_id);
      expect(finalInvite?.accepted_at).not.toBeNull();
    },
  );
});
