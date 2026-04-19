import { test, expect, createShareLink, createTestPage } from "../fixtures/bland-test";

const SEEDED_BODY_TEXT = "Shared cold deep link preserves existing body content";

test.describe("shared page route - cold deep-link", () => {
  test("fresh shared load hydrates existing body content without a leading blank block", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const sharedPage = await createTestPage(page, accessToken, "Shared Cold Page");

    await page.goto(`/${sharedPage.workspaceSlug}/${sharedPage.pageId}`);
    const seedEditor = page.locator(".tiptap[contenteditable='true']");
    await seedEditor.waitFor({ timeout: 30_000 });
    await seedEditor.click();
    await page.keyboard.type(SEEDED_BODY_TEXT);
    await expect(seedEditor).toContainText(SEEDED_BODY_TEXT);
    await page.waitForTimeout(2_500);

    const share = await createShareLink(page, accessToken, sharedPage.pageId, "view");
    const sharedContext = await browser.newContext();
    const sharedPageView = await sharedContext.newPage();
    const pageErrors: string[] = [];
    sharedPageView.on("pageerror", (err) => pageErrors.push(err.message));

    await sharedPageView.goto(`/s/${share.token}`);

    const sharedEditor = sharedPageView.locator(".tiptap[contenteditable='false']");
    await sharedEditor.waitFor({ timeout: 30_000 });
    await expect(sharedEditor).toContainText(SEEDED_BODY_TEXT);
    expect(pageErrors).toEqual([]);

    await sharedContext.close();
  });
});
