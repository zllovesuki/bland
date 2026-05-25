import { beforeEach, describe, expect, it } from "vitest";

import { GRADIENT_PRESETS } from "@/shared/page-cover";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { seedPage, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

describe("PATCH /workspaces/:wid/pages/:id cover_url", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("accepts null, upload cover URLs, and shared gradient presets", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    for (const cover_url of [GRADIENT_PRESETS[0], "/uploads/upload_cover", null]) {
      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}`, {
        method: "PATCH",
        body: { cover_url },
        userId: owner.id,
      });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ page: { cover_url } });
    }
  });

  it("rejects arbitrary gradients and malformed upload paths", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

    for (const cover_url of [
      "linear-gradient(90deg, #000000 0%, #ffffff 100%)",
      "radial-gradient(#000000 0%, #ffffff 100%)",
      "/uploads/upload_cover/extra",
      "https://example.com/cover.png",
    ]) {
      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}`, {
        method: "PATCH",
        body: { cover_url },
        userId: owner.id,
      });
      expect(res.status).toBe(400);
    }
  });
});
