import { test, expect, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("AI slash-menu generation (mock backend)", () => {
  test("/continue streams mock text into the document", async ({ authenticatedPage: { page, accessToken } }) => {
    const testPage = await createTestPage(page, accessToken, "AI Generate Target");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();

    await page.keyboard.type("Notes on the launch timeline.");
    await page.keyboard.press("Enter");

    await page.keyboard.type("/continue");
    const slashMenu = page.locator(".tiptap-slash-menu");
    await slashMenu.waitFor({ timeout: 10_000 });
    await expect(slashMenu.getByText("Continue writing")).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(editor).toContainText("[mock-chat]", { timeout: 15_000 });
    await expect(editor).toContainText("Notes on the launch timeline.");
  });
});
