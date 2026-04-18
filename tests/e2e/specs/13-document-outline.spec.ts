import type { Page as PlaywrightPage } from "@playwright/test";
import { test, expect, createTestPage, createShareLink } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

const MOBILE_VIEWPORT = { width: 900, height: 900 };
const RAIL_VIEWPORT = { width: 1100, height: 900 };
const OUTLINE_FILLER =
  "Document outline filler text keeps the section tall enough to exercise viewport-based heading visibility. ".repeat(
    10,
  );

async function insertHeading(page: PlaywrightPage, text: string) {
  await page.keyboard.type(`# ${text}`);
  await page.keyboard.press("Enter");
}

async function insertParagraphs(page: PlaywrightPage, prefix: string, count: number) {
  for (let i = 1; i <= count; i += 1) {
    await page.keyboard.insertText(`${prefix} paragraph ${i}. ${OUTLINE_FILLER}`);
    await page.keyboard.press("Enter");
  }
}

async function seedOutlineDocument(page: PlaywrightPage) {
  const editor = page.locator(".tiptap[contenteditable='true']");
  await editor.waitFor({ timeout: 30_000 });
  await editor.click();

  await insertHeading(page, "Introduction");
  await insertParagraphs(page, "Introduction", 5);
  await insertHeading(page, "Second section");
  await insertParagraphs(page, "Second section", 3);

  await expect(page.locator(".tiptap h1")).toHaveCount(2);
  await expect(page.locator(".tiptap h1").filter({ hasText: "Introduction" })).toBeVisible();
  await expect(page.locator(".tiptap h1").filter({ hasText: "Second section" })).toHaveCount(1);
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

  return editor;
}

async function expectInlineOutline(page: PlaywrightPage) {
  await expect(page.locator("aside[aria-label='Document outline']")).toHaveCount(0);
  await expect(page.locator(".tiptap-outline")).toHaveCount(1);
  await expect(page.locator(".tiptap-outline--rail")).toHaveCount(0);
}

async function expectRailOutline(page: PlaywrightPage) {
  const rail = page.locator("aside[aria-label='Document outline']");
  await expect(rail).toHaveCount(1);
  await expect(rail.locator(".tiptap-outline--rail")).toBeVisible();
  await expect(page.locator(".tiptap-outline")).toHaveCount(1);
}

async function scrollHeadingIntoView(page: PlaywrightPage, text: string) {
  const heading = page.locator(".tiptap h1").filter({ hasText: text });
  await heading.evaluate((node) => {
    node.scrollIntoView({ block: "start" });
  });
}

async function placeCaretInParagraph(page: PlaywrightPage, text: string) {
  const success = await page.evaluate((targetText) => {
    const editor = document.querySelector(".tiptap[contenteditable='true']");
    if (!(editor instanceof HTMLElement)) return false;

    const paragraph = Array.from(editor.querySelectorAll("p")).find((node) => node.textContent?.includes(targetText));
    if (!(paragraph instanceof HTMLParagraphElement)) return false;

    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    if (!(textNode instanceof Text)) return false;

    const range = document.createRange();
    range.setStart(textNode, Math.min(1, textNode.textContent?.length ?? 0));
    range.collapse(true);

    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  }, text);

  expect(success).toBe(true);
}

async function activeOutlineHeading(page: PlaywrightPage) {
  const buttons = page.locator(".tiptap-outline__button[data-active='true'] .tiptap-outline__text");
  const count = await buttons.count();
  if (count === 0) return null;
  return (await buttons.first().textContent())?.trim() ?? null;
}

async function expectActiveOutlineHeading(page: PlaywrightPage, text: string) {
  await expect.poll(() => activeOutlineHeading(page), { timeout: 10_000 }).toBe(text);
  await expect(page.locator(".tiptap-outline__button[data-active='true']")).toHaveCount(1);
}

test.describe("document outline", () => {
  test("workspace outline stays inline below 1024px and becomes a single rail at 1100px", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);

    const testPage = await createTestPage(page, accessToken, "Outline Placement Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    await seedOutlineDocument(page);
    await expectInlineOutline(page);

    await page.setViewportSize(RAIL_VIEWPORT);
    await expectRailOutline(page);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectInlineOutline(page);
  });

  test("read-only shared outline tracks the heading that is visible in the viewport", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    await page.setViewportSize(RAIL_VIEWPORT);

    const testPage = await createTestPage(page, accessToken, "Outline Visibility Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);
    await seedOutlineDocument(page);

    const share = await createShareLink(page, accessToken, testPage.pageId, "view");

    const anonContext = await browser.newContext({ viewport: RAIL_VIEWPORT });
    const anonPage = await anonContext.newPage();

    try {
      await anonPage.goto(`/s/${share.token}`);

      const sharedEditor = anonPage.locator(".tiptap[contenteditable='false']");
      await sharedEditor.waitFor({ timeout: 30_000 });
      await expectRailOutline(anonPage);

      await expectActiveOutlineHeading(anonPage, "Introduction");

      await scrollHeadingIntoView(anonPage, "Second section");

      await expectActiveOutlineHeading(anonPage, "Second section");

      await scrollHeadingIntoView(anonPage, "Introduction");

      await expectActiveOutlineHeading(anonPage, "Introduction");
    } finally {
      await anonContext.close();
    }
  });

  test("focused workspace outline prioritizes selection over viewport visibility", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    await page.setViewportSize(RAIL_VIEWPORT);

    const testPage = await createTestPage(page, accessToken, "Outline Selection Priority Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);
    await seedOutlineDocument(page);
    await expectRailOutline(page);

    await scrollHeadingIntoView(page, "Second section");
    await expectActiveOutlineHeading(page, "Second section");

    await placeCaretInParagraph(page, "Introduction paragraph 1.");
    await expect(page.locator(".tiptap h1").filter({ hasText: "Second section" })).toBeVisible();
    await expectActiveOutlineHeading(page, "Introduction");
  });
});
