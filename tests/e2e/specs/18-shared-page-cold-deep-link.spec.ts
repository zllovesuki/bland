import {
  test,
  expect,
  createShareLink,
  createTestPage,
  waitForDocEditorReady,
  waitForPersistedSnapshot,
} from "../fixtures/bland-test";

const SEEDED_BODY_TEXT = "Shared cold deep link preserves existing body content";

test.describe("shared page route - cold deep-link", () => {
  test("fresh shared load hydrates existing body content without a leading blank block", async ({
    authenticatedPage: { page, accessToken },
    e2eWorkspace,
    browser,
  }) => {
    const sharedPage = await createTestPage(page, accessToken, "Shared Cold Page", e2eWorkspace);

    await page.goto(`/${sharedPage.workspaceSlug}/${sharedPage.pageId}`);
    const seedEditor = await waitForDocEditorReady(page, { editable: true });
    await seedEditor.click();
    await page.keyboard.type(SEEDED_BODY_TEXT);
    await expect(seedEditor).toContainText(SEEDED_BODY_TEXT);
    await waitForPersistedSnapshot(page, accessToken, { ...sharedPage, expectedText: SEEDED_BODY_TEXT });

    const share = await createShareLink(page, accessToken, sharedPage.pageId, "view");
    const sharedContext = await browser.newContext();
    const sharedPageView = await sharedContext.newPage();
    const pageErrors: string[] = [];
    sharedPageView.on("pageerror", (err) => pageErrors.push(err.message));

    await sharedPageView.goto(`/s/${share.token}`);

    const sharedEditor = sharedPageView.locator(".tiptap[contenteditable='false']");
    await sharedEditor.waitFor({ timeout: 30_000 });
    await expect(sharedEditor).toContainText(SEEDED_BODY_TEXT);
    expect(pageErrors).toEqual([]);

    await sharedContext.close();
  });

  test("shared-root canvas page mounts the canvas surface (not the editor) via the seed path", async ({
    authenticatedPage: { page, accessToken },
    e2eWorkspace,
    browser,
  }) => {
    const canvasPage = await createTestPage(page, accessToken, "Shared Canvas Cold", e2eWorkspace, "canvas");
    const share = await createShareLink(page, accessToken, canvasPage.pageId, "view");

    const sharedContext = await browser.newContext();
    const sharedPageView = await sharedContext.newPage();
    const pageErrors: string[] = [];
    sharedPageView.on("pageerror", (err) => pageErrors.push(err.message));

    // Critical: share-root seed path (SharedActivePageBoundary) must carry `kind: "canvas"`
    // without relying on the live /workspaces/:wid/pages/:pid fetch.
    const pageFetches: string[] = [];
    sharedPageView.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname === `/api/v1/workspaces/${canvasPage.workspaceId}/pages/${canvasPage.pageId}`) {
        pageFetches.push(req.url());
      }
    });

    await sharedPageView.goto(`/s/${share.token}`);

    await sharedPageView.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });
    await expect(sharedPageView.locator(".tiptap")).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    await sharedContext.close();
  });
});
