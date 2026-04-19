import { test, expect, createShareLink, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("callout block", () => {
  test("slash inserts a callout, kind picker updates attrs, body persists through reload", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Callout Insert");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();

    await page.keyboard.type("/callout");
    const slashMenu = page.locator(".tiptap-slash-menu");
    await slashMenu.waitFor({ timeout: 10_000 });
    await expect(slashMenu.getByText("Callout")).toBeVisible();
    await page.keyboard.press("Enter");

    const callout = editor.locator(".tiptap-callout").first();
    await expect(callout).toBeVisible();
    await expect(callout).toHaveAttribute("data-callout-kind", "info");

    await page.keyboard.type("Deploy freeze starts Thursday");
    await expect(callout).toContainText("Deploy freeze starts Thursday");

    await callout.locator(".tiptap-callout-kind-btn").click();
    const kindMenu = page.locator('[role="menu"][aria-label="Callout kind"]');
    await kindMenu.waitFor({ timeout: 5_000 });
    await kindMenu.locator('[role="menuitemradio"][data-callout-kind="warning"]').click();

    await expect(callout).toHaveAttribute("data-callout-kind", "warning");
    await expect(callout).toContainText("Deploy freeze starts Thursday");

    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    const editorAfterReload = page.locator(".tiptap");
    await editorAfterReload.waitFor({ timeout: 30_000 });

    const reloaded = editorAfterReload.locator(".tiptap-callout").first();
    await expect(reloaded).toBeVisible();
    await expect(reloaded).toHaveAttribute("data-callout-kind", "warning");
    await expect(reloaded).toContainText("Deploy freeze starts Thursday");
  });

  test("view-only share renders callout with a disabled kind picker", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const testPage = await createTestPage(page, accessToken, "Callout Share");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();

    await page.keyboard.type("/callout");
    await page.locator(".tiptap-slash-menu").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Enter");

    await page.keyboard.type("Read only callout");

    const callout = editor.locator(".tiptap-callout").first();
    await callout.locator(".tiptap-callout-kind-btn").click();
    await page
      .locator('[role="menu"][aria-label="Callout kind"] [role="menuitemradio"][data-callout-kind="tip"]')
      .click();

    await expect(callout).toHaveAttribute("data-callout-kind", "tip");
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    const share = await createShareLink(page, accessToken, testPage.pageId, "view");

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/s/${share.token}`);

    const sharedEditor = anonPage.locator(".tiptap");
    await sharedEditor.waitFor({ timeout: 30_000 });
    await expect(sharedEditor).toHaveAttribute("contenteditable", "false");

    const sharedCallout = sharedEditor.locator(".tiptap-callout").first();
    await expect(sharedCallout).toBeVisible();
    await expect(sharedCallout).toHaveAttribute("data-callout-kind", "tip");
    await expect(sharedCallout).toContainText("Read only callout");

    const sharedKindBtn = sharedCallout.locator(".tiptap-callout-kind-btn");
    await expect(sharedKindBtn).toBeDisabled();

    await sharedKindBtn.click({ force: true }).catch(() => undefined);
    await expect(anonPage.locator('[role="menu"][aria-label="Callout kind"]')).toHaveCount(0);

    await anonContext.close();
  });
});
