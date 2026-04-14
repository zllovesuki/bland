import type { Locator, Page } from "@playwright/test";
import { test, expect, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

async function expectHighlightedCodeBlock(page: Page) {
  await expect
    .poll(async () => {
      return await page.locator(".tiptap-code-block-content span[class*='hljs-']").count();
    })
    .toBeGreaterThan(0);
}

async function openBlockActionsMenu(page: Page, block: Locator) {
  await block.hover();
  const toggle = page.locator(".tiptap-drag-handle-toggle");
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  await toggle.click();

  const menu = page.getByRole("menu", { name: "Block actions" });
  await expect(menu).toBeVisible({ timeout: 5_000 });
  return menu;
}

async function moveBlock(page: Page, block: Locator, label: "Move up" | "Move down") {
  const menu = await openBlockActionsMenu(page, block);
  await menu.getByRole("menuitem", { name: label }).click();
}

async function expectCodeBlockAbove(codeBlock: Locator, paragraph: Locator) {
  await expect
    .poll(async () => {
      const [codeBox, paragraphBox] = await Promise.all([codeBlock.boundingBox(), paragraph.boundingBox()]);
      if (!codeBox || !paragraphBox) return false;
      return codeBox.y < paragraphBox.y;
    })
    .toBe(true);
}

async function expectCodeBlockBelow(codeBlock: Locator, paragraph: Locator) {
  await expect
    .poll(async () => {
      const [codeBox, paragraphBox] = await Promise.all([codeBlock.boundingBox(), paragraph.boundingBox()]);
      if (!codeBox || !paragraphBox) return false;
      return codeBox.y > paragraphBox.y;
    })
    .toBe(true);
}

test.describe("drag handle block reordering", () => {
  test("retains code block syntax highlighting when moving via block actions", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Drag Handle Reorder Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type("Before");
    await page.keyboard.press("Enter");
    await page.keyboard.type("```ts ");
    await page.keyboard.type("const count = 1");

    await expect(editor).toContainText("Before");
    await expect(editor).toContainText("const count = 1");
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });
    await expectHighlightedCodeBlock(page);

    const codeBlock = page.locator(".tiptap-code-block-wrapper");
    const paragraph = page.locator(".tiptap p").filter({ hasText: "Before" });

    await moveBlock(page, codeBlock, "Move up");
    await expectCodeBlockAbove(codeBlock, paragraph);
    await expectHighlightedCodeBlock(page);

    await moveBlock(page, codeBlock, "Move down");
    await expectCodeBlockBelow(codeBlock, paragraph);
    await expectHighlightedCodeBlock(page);
  });
});
