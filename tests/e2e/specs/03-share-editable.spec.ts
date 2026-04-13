import { test, expect, createTestPage, createShareLink } from "../fixtures/bland-test";

test.describe("share link - editable", () => {
  test("edit-permission share link allows typing", async ({ authenticatedPage: { page, accessToken }, browser }) => {
    // Create a page and an editable share link
    const testPage = await createTestPage(page, accessToken, "Share Edit Test");
    const share = await createShareLink(page, accessToken, testPage.pageId, "edit");

    // Open the share link in a new unauthenticated browser context
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/s/${share.token}`);

    // Wait for the editor to mount in editable mode
    const editor = anonPage.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });

    // Type text and verify it appears
    await editor.click();
    await anonPage.keyboard.type("Edited via share link");
    await expect(editor).toContainText("Edited via share link");

    await anonContext.close();
  });
});
