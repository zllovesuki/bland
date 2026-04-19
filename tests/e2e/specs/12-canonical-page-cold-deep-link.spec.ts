import { test, expect, createTestPage, loginPage } from "../fixtures/bland-test";

const SEEDED_BODY_TEXT = "Cold deep link preserves existing body content";

test.describe("canonical page route - cold deep-link", () => {
  test("cold deep-link hydrates existing body content without a leading blank block", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const testPage = await createTestPage(page, accessToken, "Cold Deep Link Page");
    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    const seedEditor = page.locator(".tiptap[contenteditable='true']");
    await seedEditor.waitFor({ timeout: 30_000 });
    await seedEditor.click();
    await page.keyboard.type(SEEDED_BODY_TEXT);
    await expect(seedEditor).toContainText(SEEDED_BODY_TEXT);
    await page.waitForTimeout(2_500);

    const coldContext = await browser.newContext();
    const coldPage = await coldContext.newPage();
    await loginPage(coldPage);

    const contextCalls: string[] = [];
    const workspacesListCalls: string[] = [];
    const pagesListCalls: string[] = [];
    const membersCalls: string[] = [];
    const pageErrors: string[] = [];

    coldPage.on("pageerror", (err) => pageErrors.push(err.message));
    coldPage.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname === `/api/v1/pages/${testPage.pageId}/context`) {
        contextCalls.push(req.url());
      } else if (url.pathname === "/api/v1/workspaces") {
        workspacesListCalls.push(req.url());
      } else if (url.pathname === `/api/v1/workspaces/${testPage.workspaceId}/pages`) {
        pagesListCalls.push(req.url());
      } else if (url.pathname === `/api/v1/workspaces/${testPage.workspaceId}/members`) {
        membersCalls.push(req.url());
      }
    });

    await coldPage.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    const editor = coldPage.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await expect(editor).toContainText(SEEDED_BODY_TEXT);

    await editor.click();
    await coldPage.keyboard.type(" Cold deep link works");
    await expect(editor).toContainText(SEEDED_BODY_TEXT);
    await expect(editor).toContainText("Cold deep link works");

    expect(contextCalls.length).toBeGreaterThanOrEqual(1);
    expect(contextCalls.length).toBeLessThanOrEqual(2);
    expect(pagesListCalls.length).toBeGreaterThanOrEqual(1);
    expect(membersCalls.length).toBeGreaterThanOrEqual(1);
    expect(workspacesListCalls).toHaveLength(0);
    expect(pageErrors).toEqual([]);

    await coldContext.close();
  });

  test("brand-new cold deep-link waits for first sync when no persisted snapshot exists yet", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const testPage = await createTestPage(page, accessToken, "Cold Empty Page");

    const coldContext = await browser.newContext();
    const coldPage = await coldContext.newPage();
    await loginPage(coldPage);

    const snapshotStatuses: number[] = [];
    const pageErrors: string[] = [];
    coldPage.on("pageerror", (err) => pageErrors.push(err.message));
    coldPage.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname === `/api/v1/workspaces/${testPage.workspaceId}/pages/${testPage.pageId}/snapshot`) {
        snapshotStatuses.push(response.status());
      }
    });

    await coldPage.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    const editor = coldPage.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();
    await coldPage.keyboard.type("Fresh cold path works");
    await expect(editor).toContainText("Fresh cold path works");

    expect(snapshotStatuses).toContain(204);
    expect(pageErrors).toEqual([]);

    await coldContext.close();
  });
});
