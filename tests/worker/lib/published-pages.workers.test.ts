import { beforeEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";

import { publishedPages } from "@/worker/db/d1/schema";
import { resolvePublishedMentions } from "@/worker/lib/published-pages";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { seedPage, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

describe("published page D1 resolvers", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("resolves large mention sets in D1-sized batches", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const mentionIds = Array.from({ length: 105 }, () => ulid());
    const reachablePageId = mentionIds[104]!;
    const reachablePage = await seedPage({
      id: reachablePageId,
      workspace_id: ws.id,
      created_by: owner.id,
      title: "Published Reference",
      icon: "P",
    });

    await getDb()
      .insert(publishedPages)
      .values({ workspace_id: ws.id, page_id: reachablePage.id, published_by: owner.id });

    const mentions = await resolvePublishedMentions(getDb(), ws.id, mentionIds);

    expect(mentions.size).toBe(mentionIds.length);
    expect(mentions.get(reachablePageId)).toEqual({
      pageId: reachablePageId,
      reachable: true,
      title: "Published Reference",
      icon: "P",
    });
    expect(mentions.get(mentionIds[0]!)).toEqual({
      pageId: mentionIds[0]!,
      reachable: false,
      title: null,
      icon: null,
    });
  });
});
