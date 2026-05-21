import { test, expect, loginAsFreshTesseraUser } from "../fixtures/bland-test";

test.describe("OIDC first-time login", () => {
  test("a fresh tessera user lands on a default workspace and can list workspaces", async ({ page }) => {
    const sub = `e2e-fresh-${Date.now()}`;
    const email = `${sub}@bland.test`;
    const { accessToken } = await loginAsFreshTesseraUser(page, { sub, email, name: "Fresh Pilot" }, "/");

    const res = await page.request.get("/api/v1/workspaces", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { workspaces: Array<{ id: string; slug: string }> };
    expect(body.workspaces.length).toBeGreaterThan(0);
  });
});
