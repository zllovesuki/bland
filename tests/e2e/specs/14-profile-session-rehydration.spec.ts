import { test, expect } from "../fixtures/bland-test";

test.describe("profile session rehydration", () => {
  test("cached profile session renders immediately, shows background refresh UI, and dedupes refresh requests", async ({
    authenticatedPage: { page },
  }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible({ timeout: 30_000 });

    const nameInput = page.locator("#profile-name");
    const initialName = await nameInput.inputValue();
    let refreshCalls = 0;

    await page.route("**/api/v1/auth/refresh", async (route) => {
      refreshCalls += 1;
      await page.waitForTimeout(1200);
      await route.continue();
    });

    await page.reload();

    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Restoring your session in the background.")).toBeVisible();
    await expect(page.getByText("Restoring your session before profile changes.")).toBeVisible();

    await nameInput.fill(`${initialName} updated`);
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

    await expect(page.getByText("Restoring your session in the background.")).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(refreshCalls).toBe(1);
  });
});
