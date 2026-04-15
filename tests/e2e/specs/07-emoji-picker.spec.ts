import type { Locator } from "@playwright/test";
import { test, expect, createTestPage } from "../fixtures/bland-test";

async function getSearchSelection(input: Locator) {
  return await input.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      return null;
    }

    return {
      end: element.selectionEnd,
      start: element.selectionStart,
    };
  });
}

test.describe("emoji picker", () => {
  test("keeps native caret movement in search while still allowing keyboard selection", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Emoji Picker Keyboard Test");
    await page.goto(`/${testPage.workspaceSlug}/settings`);
    await expect(page.getByRole("heading", { name: "Workspace Settings" })).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole("button", { name: /Add icon|Change icon/ })
      .first()
      .click();

    const search = page.locator(".bland-emoji-picker-search");
    await expect(search).toBeVisible();
    await search.fill("orca");

    expect(await getSearchSelection(search)).toEqual({ start: 4, end: 4 });

    await page.keyboard.press("Home");
    expect(await getSearchSelection(search)).toEqual({ start: 0, end: 0 });

    await page.keyboard.press("End");
    expect(await getSearchSelection(search)).toEqual({ start: 4, end: 4 });

    await page.keyboard.press("ArrowLeft");
    expect(await getSearchSelection(search)).toEqual({ start: 3, end: 3 });

    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page.locator(".bland-emoji-picker")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "🫍" })).toBeVisible();
  });
});
