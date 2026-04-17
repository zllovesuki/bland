import { test, expect } from "../fixtures/bland-test";

test.describe("invalid share token - terminal error", () => {
  test("invalid token renders clean terminal error without share chrome", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/s/definitely-not-a-real-token");

    // Terminal error content should be visible
    const errorMessage = page.locator("text=Share link not found or expired");
    await expect(errorMessage).toBeVisible({ timeout: 15_000 });

    // "Go home" action button should be present
    const goHome = page.locator("button", { hasText: "Go home" });
    await expect(goHome).toBeVisible();

    // Share header must NOT be rendered (no <header> element)
    await expect(page.locator("header")).toHaveCount(0);

    // Share sidebar must NOT be rendered (no sidebar nav)
    await expect(page.locator("nav[aria-hidden]")).toHaveCount(0);

    // Share footer must NOT be rendered
    await expect(page.locator("footer")).toHaveCount(0);

    // No JS errors
    expect(pageErrors).toEqual([]);

    await ctx.close();
  });

  test("expired share token renders terminal error without share chrome (authenticated)", async ({
    authenticatedPage: { page },
  }) => {
    // Use an authenticated context navigating to a bad token to verify
    // the terminal state is the same regardless of auth status
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/s/this-token-does-not-exist");

    const errorMessage = page.locator("text=Share link not found or expired");
    await expect(errorMessage).toBeVisible({ timeout: 15_000 });

    await expect(page.locator("header")).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });
});
