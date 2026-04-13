import { test, expect, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("auth + edit + persist", () => {
  test("login, type in editor, reload, verify text persisted", async ({ authenticatedPage: { page, accessToken } }) => {
    const testPage = await createTestPage(page, accessToken, "Persist Test");

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    // Wait for the editor to mount and become editable
    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });

    // Click into the editor and type
    await editor.click();
    await page.keyboard.type("Hello Playwright");

    // Wait for typed content to be visible in the editor
    await expect(editor).toContainText("Hello Playwright");

    // Wait for WebSocket sync by checking the sync status indicator
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    // Reload and verify persistence
    await page.reload();
    const editorAfterReload = page.locator(".tiptap");
    await editorAfterReload.waitFor({ timeout: 30_000 });

    await expect(editorAfterReload).toContainText("Hello Playwright");
  });
});
