import { test, expect, createTestPage, waitForDocEditorReady } from "../fixtures/bland-test";

test.describe("auth + edit + persist", () => {
  test("login, type in editor, reload, verify text persisted", async ({
    authenticatedPage: { page, accessToken },
    e2eWorkspace,
  }) => {
    const testPage = await createTestPage(page, accessToken, "Persist Test", e2eWorkspace);

    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    // Wait for the editor to mount and become editable
    const editor = await waitForDocEditorReady(page, { editable: true });

    // Click into the editor and type
    await editor.click();
    await page.keyboard.type("Hello Playwright");

    // Wait for typed content to be visible in the editor
    await expect(editor).toContainText("Hello Playwright");

    // Wait for WebSocket sync by checking the sync status indicator
    await waitForDocEditorReady(page, { editable: true, connected: true });

    // Reload and verify persistence
    await page.reload();
    const editorAfterReload = page.locator(".tiptap");
    await editorAfterReload.waitFor({ timeout: 30_000 });

    await expect(editorAfterReload).toContainText("Hello Playwright");
  });
});
