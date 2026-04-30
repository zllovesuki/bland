import type { Page } from "@playwright/test";
import { test, expect, createTestPage } from "../fixtures/bland-test";

async function getSelectionText(page: Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

async function clickCodeBlockText(page: Page, text: string, clickCount: 2 | 3): Promise<void> {
  const point = await page.locator(".tiptap-code-block-content").evaluate((codeBlock, targetText) => {
    const walker = document.createTreeWalker(codeBlock, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const nodeText = textNode.textContent ?? "";
      const index = nodeText.indexOf(targetText);
      if (index === -1) continue;

      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + targetText.length);

      const rect = range.getClientRects()[0];
      range.detach();

      if (!rect) continue;
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    return null;
  }, text);

  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y, { clickCount });
}

test.describe("code block selection", () => {
  test("double-click selects a word and triple-click selects the clicked line", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Code Block Selection Test");

    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });

    await editor.click();
    await page.keyboard.type("```ts ");
    await page.keyboard.type("const alpha = 1;");
    await page.keyboard.press("Enter");
    await page.keyboard.type("let betaValue = alpha + 1;");

    const codeBlock = page.locator(".tiptap-code-block-content");
    await expect(codeBlock).toContainText("const alpha = 1;");
    await expect(codeBlock).toContainText("let betaValue = alpha + 1;");

    await clickCodeBlockText(page, "alpha", 2);
    await expect.poll(() => getSelectionText(page)).toBe("alpha");

    await page.waitForTimeout(600);
    await clickCodeBlockText(page, "betaValue", 3);
    await expect.poll(() => getSelectionText(page)).toBe("let betaValue = alpha + 1;");
  });
});
