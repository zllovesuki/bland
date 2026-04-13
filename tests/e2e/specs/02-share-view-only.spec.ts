import { test, expect, createTestPage, createShareLink } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("share link - view only", () => {
  test("view-only share link shows content but prevents editing", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    // Create a page and add content as the authenticated user
    const testPage = await createTestPage(page, accessToken, "Share View Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type("Shared content visible");

    // Wait for content and sync before creating the share link
    await expect(editor).toContainText("Shared content visible");
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    // Create a view-only share link
    const share = await createShareLink(page, accessToken, testPage.pageId, "view");

    // Open the share link in a new unauthenticated browser context
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/s/${share.token}`);

    // Wait for the editor to mount in read-only mode
    const sharedEditor = anonPage.locator(".tiptap");
    await sharedEditor.waitFor({ timeout: 30_000 });

    // Verify content is visible
    await expect(sharedEditor).toContainText("Shared content visible");

    // Verify the editor is not editable
    await expect(sharedEditor).toHaveAttribute("contenteditable", "false");

    // Verify no drag handle is present (it only renders when !readOnly)
    await expect(anonPage.locator(".drag-handle")).toHaveCount(0);

    // Attempt to type and verify the content does not change
    const contentBefore = await sharedEditor.textContent();
    await sharedEditor.click();
    await anonPage.keyboard.type("should not appear");
    const contentAfter = await sharedEditor.textContent();
    expect(contentAfter).toBe(contentBefore);

    await anonContext.close();
  });
});
