import type { Locator, Page } from "@playwright/test";
import { test, expect, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

async function expectPopoverNearTrigger(panel: Locator, trigger: Locator) {
  await expect(panel).toBeVisible();

  const [panelBox, triggerBox] = await Promise.all([panel.boundingBox(), trigger.boundingBox()]);

  expect(panelBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();

  const resolvedPanelBox = panelBox!;
  const resolvedTriggerBox = triggerBox!;
  const triggerBottom = resolvedTriggerBox.y + resolvedTriggerBox.height;

  expect(resolvedPanelBox.x).toBeGreaterThan(16);
  expect(resolvedPanelBox.y).toBeGreaterThan(16);
  expect(Math.abs(resolvedPanelBox.x - resolvedTriggerBox.x)).toBeLessThan(96);
  expect(Math.abs(resolvedPanelBox.y - triggerBottom)).toBeLessThan(120);
}

async function expectColorPanelGrid(panel: Locator) {
  const panelBox = await panel.boundingBox();

  expect(panelBox).not.toBeNull();

  const resolvedPanelBox = panelBox!;

  expect(resolvedPanelBox.width).toBeGreaterThan(120);
  expect(resolvedPanelBox.height).toBeLessThan(120);
}

async function openFormattingToolbar(page: Page) {
  const editor = page.locator(".tiptap[contenteditable='true']");
  await editor.waitFor({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.type("Some text to select");
  await expect(editor).toContainText("Some text to select");
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("ControlOrMeta+A");
  await expect(page.getByRole("button", { name: "Text color" })).toBeVisible({ timeout: 5_000 });
}

async function createLinkFromSelection(page: Page, href: string) {
  const toolbar = page.locator(".tiptap-toolbar");
  await toolbar.getByRole("button", { name: "Link" }).click();
  await page.locator(".tiptap-link-input").fill(href);
  await toolbar.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".tiptap a")).toHaveCount(1);
}

async function collapseCursorInsideFirstLink(page: Page) {
  const success = await page.evaluate(() => {
    const editor = document.querySelector(".tiptap");
    const textNode = document.querySelector(".tiptap a")?.firstChild;
    if (!(editor instanceof HTMLElement) || !(textNode instanceof Text)) return false;

    const range = document.createRange();
    range.setStart(textNode, Math.min(1, textNode.length));
    range.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  });

  expect(success).toBe(true);
}

async function blurEditorFocus(page: Page) {
  const success = await page.evaluate(() => {
    const title = document.querySelector('textarea[placeholder="Untitled"]');
    if (!(title instanceof HTMLTextAreaElement)) return false;

    window.getSelection()?.removeAllRanges();
    title.focus();
    document.dispatchEvent(new Event("selectionchange"));
    return document.activeElement === title;
  });

  expect(success).toBe(true);
}

test.describe("toolbar popover anchoring", () => {
  test("text color and highlight panels anchor to the formatting toolbar buttons", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Toolbar Popover Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    await openFormattingToolbar(page);

    const textColorButton = page.getByRole("button", { name: "Text color" });
    await textColorButton.click();
    const colorPanel = page.locator(".tiptap-color-panel");
    await expectPopoverNearTrigger(colorPanel, textColorButton);
    await expectColorPanelGrid(colorPanel);

    const highlightButton = page.getByRole("button", { name: "Highlight" });
    await highlightButton.click();
    await expectPopoverNearTrigger(colorPanel, highlightButton);
    await expectColorPanelGrid(colorPanel);
  });

  test("code block language menu still anchors to its button", async ({ authenticatedPage: { page, accessToken } }) => {
    const testPage = await createTestPage(page, accessToken, "Code Block Popover Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type("```ts ");

    const languageButton = page.getByRole("button", { name: /Language:/ });
    await expect(languageButton).toBeVisible({ timeout: 5_000 });
    await languageButton.click();

    const languageMenu = page.getByRole("menu", { name: "Code block language" });
    await expectPopoverNearTrigger(languageMenu, languageButton);

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const dropdown = document.querySelector(".tiptap-code-block-lang-dropdown");
          const active = document.querySelector(".tiptap-code-block-lang-item.is-active");
          if (!(dropdown instanceof HTMLDivElement) || !(active instanceof HTMLButtonElement)) return false;

          const visibleTop = dropdown.scrollTop;
          const visibleBottom = dropdown.scrollTop + dropdown.clientHeight;
          const activeTop = active.offsetTop;
          const activeBottom = active.offsetTop + active.offsetHeight;

          return dropdown.scrollTop > 0 && activeTop >= visibleTop && activeBottom <= visibleBottom;
        });
      })
      .toBe(true);

    const selectedLanguageState = await page.evaluate(() => {
      const dropdown = document.querySelector(".tiptap-code-block-lang-dropdown");
      const active = document.querySelector(".tiptap-code-block-lang-item.is-active");
      if (!(dropdown instanceof HTMLDivElement) || !(active instanceof HTMLButtonElement)) return null;

      const visibleTop = dropdown.scrollTop;
      const visibleBottom = dropdown.scrollTop + dropdown.clientHeight;
      const activeTop = active.offsetTop;
      const activeBottom = active.offsetTop + active.offsetHeight;

      return {
        scrollTop: dropdown.scrollTop,
        paddingTop: getComputedStyle(dropdown).paddingTop,
        paddingBottom: getComputedStyle(dropdown).paddingBottom,
        fullyVisible: activeTop >= visibleTop && activeBottom <= visibleBottom,
      };
    });

    if (!selectedLanguageState) {
      throw new Error("Expected selected language state after opening the code block language menu.");
    }

    expect(selectedLanguageState.scrollTop).toBeGreaterThan(0);
    expect(selectedLanguageState.fullyVisible).toBe(true);
    expect(selectedLanguageState.paddingTop).toBe("4px");
    expect(selectedLanguageState.paddingBottom).toBe("4px");
  });

  test("link toolbar anchors to the linked text instead of the viewport origin", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Link Toolbar Popover Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    await openFormattingToolbar(page);
    await createLinkFromSelection(page, "https://example.com");
    await collapseCursorInsideFirstLink(page);

    const linkedText = page.locator(".tiptap a").first();
    await expectPopoverNearTrigger(page.locator(".tiptap-link-toolbar"), linkedText);
    await expect(page.getByRole("button", { name: "Edit link" })).toBeVisible({ timeout: 5_000 });
  });

  test("link hover popup stays open when moving from the link into the toolbar", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Link Hover Toolbar Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    await openFormattingToolbar(page);
    await createLinkFromSelection(page, "https://example.com");
    await blurEditorFocus(page);

    const linkedText = page.locator(".tiptap a").first();
    const linkToolbar = page.locator(".tiptap-link-toolbar");

    await linkedText.hover();
    await expect(linkToolbar).toBeVisible({ timeout: 5_000 });

    const [linkBox, toolbarBox] = await Promise.all([linkedText.boundingBox(), linkToolbar.boundingBox()]);

    expect(linkBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();

    const fromX = linkBox!.x + linkBox!.width / 2;
    const fromY = linkBox!.y + linkBox!.height / 2;
    const toX = toolbarBox!.x + toolbarBox!.width / 2;
    const toY = toolbarBox!.y + toolbarBox!.height / 2;

    await page.mouse.move(fromX, fromY);
    await page.mouse.move(toX, toY, { steps: 12 });
    await page.waitForTimeout(300);
    await expect(linkToolbar).toBeVisible();
  });
});
