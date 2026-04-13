import { test, expect, createTestPage, createShareLink } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("read-only controller suppression", () => {
  test("formatting toolbar appears on selection in editable mode, absent in read-only", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    // Create a page with text content
    const testPage = await createTestPage(page, accessToken, "Controller Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type("Some text to select");

    // Wait for content to appear and sync to complete
    await expect(editor).toContainText("Some text to select");
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    // Select all text with keyboard (ControlOrMeta for cross-platform)
    await page.keyboard.press("ControlOrMeta+A");

    // Verify the formatting toolbar appears in editable mode
    const toolbar = page.locator(".tiptap-toolbar");
    await toolbar.waitFor({ state: "visible", timeout: 5_000 });

    // Verify drag handle is present in editable mode
    await expect(page.locator(".drag-handle")).toHaveCount(1);

    // Create a view-only share link and open it
    const share = await createShareLink(page, accessToken, testPage.pageId, "view");

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/s/${share.token}`);

    const readOnlyEditor = anonPage.locator(".tiptap[contenteditable='false']");
    await readOnlyEditor.waitFor({ timeout: 30_000 });

    // Verify content is present
    await expect(readOnlyEditor).toContainText("Some text to select");

    // Verify no drag handle in read-only mode
    await expect(anonPage.locator(".drag-handle")).toHaveCount(0);

    // Try to select text -- formatting toolbar should NOT appear
    await readOnlyEditor.click();
    await anonPage.keyboard.press("ControlOrMeta+A");
    // Assert no toolbar appeared (use strict count assertion with short timeout)
    await expect(anonPage.locator(".tiptap-toolbar")).toHaveCount(0, { timeout: 2_000 });

    await anonContext.close();
  });
});
