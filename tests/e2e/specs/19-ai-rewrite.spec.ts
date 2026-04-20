import { test, expect, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("AI rewrite (mock backend)", () => {
  test("bubble menu proofread streams a mock suggestion and Accept commits it", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "AI Rewrite Target");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();

    const sentence = "Teh quick brown fox jumped over the lazy dog";
    await page.keyboard.type(sentence);
    await expect(editor).toContainText(sentence);

    // Select the whole paragraph.
    await page.keyboard.press("Shift+Home");

    const aiButton = page.locator('button[aria-label="AI actions"]');
    await aiButton.waitFor({ timeout: 10_000 });
    await aiButton.click();

    const menu = page.locator('[role="menu"]');
    await expect(menu.getByRole("menuitem", { name: "Proofread" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Proofread" }).click();

    const preview = page.locator(".tiptap-ai-preview");
    await preview.waitFor({ timeout: 15_000 });
    await expect(preview).toContainText("[mock-chat]");

    const acceptBtn = preview.locator('[data-ai-suggestion-action="accept"]');
    await expect(acceptBtn).toBeEnabled({ timeout: 15_000 });
    await acceptBtn.click();

    await expect(page.locator(".tiptap-ai-preview")).toHaveCount(0);
    await expect(editor).toContainText("[mock-chat]");
  });

  test("AI button is hidden when page content is not selected", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "AI Rewrite Empty");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();

    await expect(page.locator('button[aria-label="AI actions"]')).toHaveCount(0);
  });
});
