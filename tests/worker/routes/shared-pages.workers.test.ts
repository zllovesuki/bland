import { beforeEach, describe, expect, it } from "vitest";

import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

type SharedPagesResponse = {
  items: Array<{
    page_id: string;
    title: string;
    permission: "view" | "edit";
    workspace: { id: string; slug: string; role: string | null };
    shared_by: string;
    shared_by_name: string;
  }>;
  workspace_summaries: Array<{
    workspace: { id: string; slug: string; name: string };
    count: number;
  }>;
};

describe("GET /me/shared-pages", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("partitions user-grantee shares into cross-workspace items and same-workspace summaries", async () => {
    const caller = await seedUser();
    const sharerOther = await seedUser({ name: "Alice" });
    const sharerHome = await seedUser({ name: "Bob" });

    const otherWs = await seedWorkspace({ owner_id: sharerOther.id, slug: "other", name: "Other" });
    const homeWs = await seedWorkspace({ owner_id: sharerHome.id, slug: "home", name: "Home" });
    await seedMembership({ user_id: caller.id, workspace_id: homeWs.id, role: "member" });

    const crossPage = await seedPage({
      workspace_id: otherWs.id,
      created_by: sharerOther.id,
      title: "Cross-workspace page",
    });
    await seedPageShare({
      page_id: crossPage.id,
      created_by: sharerOther.id,
      grantee_type: "user",
      grantee_id: caller.id,
      permission: "view",
    });

    const sameWsPageA = await seedPage({ workspace_id: homeWs.id, created_by: sharerHome.id, title: "A" });
    const sameWsPageB = await seedPage({ workspace_id: homeWs.id, created_by: sharerHome.id, title: "B" });
    const sameWsPageC = await seedPage({ workspace_id: homeWs.id, created_by: sharerHome.id, title: "C" });
    for (const page of [sameWsPageA, sameWsPageB, sameWsPageC]) {
      await seedPageShare({
        page_id: page.id,
        created_by: sharerHome.id,
        grantee_type: "user",
        grantee_id: caller.id,
        permission: "edit",
      });
    }

    const res = await apiRequest("/api/v1/me/shared-pages", { userId: caller.id });
    expect(res.status).toBe(200);

    const body = (await res.json()) as SharedPagesResponse;

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      page_id: crossPage.id,
      title: "Cross-workspace page",
      workspace: { id: otherWs.id, slug: "other", role: null },
      permission: "view",
      shared_by: sharerOther.id,
      shared_by_name: "Alice",
    });

    expect(body.workspace_summaries).toHaveLength(1);
    expect(body.workspace_summaries[0]).toMatchObject({
      workspace: { id: homeWs.id, slug: "home", name: "Home" },
      count: 3,
    });
  });

  it("ignores link-grantee shares and archived pages", async () => {
    const caller = await seedUser();
    const sharer = await seedUser();
    const ws = await seedWorkspace({ owner_id: sharer.id });
    await seedMembership({ user_id: caller.id, workspace_id: ws.id, role: "member" });

    const archivedPage = await seedPage({
      workspace_id: ws.id,
      created_by: sharer.id,
      archived_at: "2026-04-01T00:00:00.000Z",
    });
    await seedPageShare({
      page_id: archivedPage.id,
      created_by: sharer.id,
      grantee_type: "user",
      grantee_id: caller.id,
      permission: "view",
    });

    const livePage = await seedPage({ workspace_id: ws.id, created_by: sharer.id });
    await seedPageShare({
      page_id: livePage.id,
      created_by: sharer.id,
      grantee_type: "link",
      grantee_id: null,
      link_token: "link-token-1",
      permission: "view",
    });

    const res = await apiRequest("/api/v1/me/shared-pages", { userId: caller.id });
    expect(res.status).toBe(200);

    const body = (await res.json()) as SharedPagesResponse;
    expect(body.items).toEqual([]);
    expect(body.workspace_summaries).toEqual([]);
  });
});
