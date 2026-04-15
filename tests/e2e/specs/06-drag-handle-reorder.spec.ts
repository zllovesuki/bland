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

async function expectHighlightedKeyword(page: Page, keyword: string) {
  await expect
    .poll(async () => {
      return await page
        .locator(".tiptap-code-block-content .hljs-keyword")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? "").join(" "));
    })
    .toContain(keyword);
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

async function selectEntireCodeBlockText(page: Page) {
  const success = await page.evaluate(() => {
    const editor = document.querySelector(".tiptap");
    const codeBlock = document.querySelector(".tiptap-code-block-content");
    if (!(editor instanceof HTMLElement) || !(codeBlock instanceof HTMLElement)) {
      return false;
    }

    const walker = document.createTreeWalker(codeBlock, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    while (walker.nextNode()) {
      if (walker.currentNode instanceof Text && (walker.currentNode.textContent ?? "").length > 0) {
        textNodes.push(walker.currentNode);
      }
    }

    if (textNodes.length === 0) {
      return false;
    }

    const range = document.createRange();
    range.setStart(textNodes[0], 0);

    const lastTextNode = textNodes[textNodes.length - 1];
    range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    document.dispatchEvent(new Event("selectionchange"));

    return selection?.toString() === codeBlock.textContent;
  });

  expect(success).toBe(true);
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

  test("refreshes syntax highlighting after collaborative code edits while the observer cursor stays outside the block", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Collaborative Highlight Refresh Test");
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

    const collaborator = await page.context().newPage();
    try {
      await collaborator.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);
      const collaboratorEditor = collaborator.locator(".tiptap[contenteditable='true']");
      await collaboratorEditor.waitFor({ timeout: 30_000 });
      await expect(collaboratorEditor).toContainText("const count = 1");
      await expect(collaborator.getByText("Connected")).toBeVisible({ timeout: 15_000 });
      await expectHighlightedCodeBlock(collaborator);

      await page.locator(".tiptap p").filter({ hasText: "Before" }).click();

      await selectEntireCodeBlockText(collaborator);
      await collaborator.keyboard.type("while (true) {}");

      await expect(collaboratorEditor).toContainText("while (true) {}");
      await expect(editor).toContainText("while (true) {}");
      await expectHighlightedKeyword(page, "while");
    } finally {
      await collaborator.close();
    }
  });
});
