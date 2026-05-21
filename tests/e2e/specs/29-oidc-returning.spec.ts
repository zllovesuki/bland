import { test, expect, loginPage } from "../fixtures/bland-test";

test.describe("OIDC returning user", () => {
  test("two sign-ins do not duplicate the baseline workspace", async ({ page, browser }) => {
    const first = await loginPage(page);
    const wsRes = await page.request.get("/api/v1/workspaces", {
      headers: { Authorization: `Bearer ${first.accessToken}` },
    });
    expect(wsRes.ok()).toBe(true);
    const firstBody = (await wsRes.json()) as { workspaces: Array<{ id: string; slug: string }> };
    const firstCount = firstBody.workspaces.length;
    expect(firstCount).toBeGreaterThan(0);

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    try {
      const second = await loginPage(secondPage);
      const wsRes2 = await secondPage.request.get("/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${second.accessToken}` },
      });
      expect(wsRes2.ok()).toBe(true);
      const secondBody = (await wsRes2.json()) as { workspaces: Array<{ id: string; slug: string }> };
      expect(secondBody.workspaces.length).toBe(firstCount);
    } finally {
      await secondContext.close();
    }
  });
});
