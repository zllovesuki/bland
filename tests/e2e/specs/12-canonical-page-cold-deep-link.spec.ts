import { test, expect, createTestPage } from "../fixtures/bland-test";

test.describe("canonical page route - cold deep-link", () => {
  test("hitting /$workspaceSlug/$pageId with no localStorage cache uses pages.context as the primary bootstrap call", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Create a page via API. This does not populate the client's localStorage
    // workspace cache because no UI has rendered yet — the only client-side
    // state is the refresh cookie set by the login fixture.
    const testPage = await createTestPage(page, accessToken, "Cold Deep Link Page");

    // Track only requests fired by the page navigation; the createTestPage call
    // above runs through page.request and is not observed here.
    const contextCalls: string[] = [];
    const workspacesListCalls: string[] = [];
    const pagesListCalls: string[] = [];
    const membersCalls: string[] = [];

    page.on("request", (req) => {
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

    // Cold deep-link: workspace identity is bootstrapped from pages.context,
    // not from a slug-first workspaces.list lookup.
    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });

    // Page surface is interactive end-to-end.
    await editor.click();
    await page.keyboard.type("Cold deep link works");
    await expect(editor).toContainText("Cold deep link works");

    // Architectural invariant: the canonical page-route resolver bootstraps
    // workspace identity from pages.context — never from a slug-first
    // workspaces.list lookup.
    //
    // Count tolerance: under React StrictMode the dev server double-invokes
    // effects, so the network request can fire twice while the request guard
    // still consumes only one result. The assertion covers the shape (one or
    // two calls) rather than pin a dev-mode artifact.
    expect(contextCalls.length).toBeGreaterThanOrEqual(1);
    expect(contextCalls.length).toBeLessThanOrEqual(2);

    // Workspace data loads in the parallel wave alongside pages.context.
    expect(pagesListCalls.length).toBeGreaterThanOrEqual(1);
    expect(membersCalls.length).toBeGreaterThanOrEqual(1);

    // The canonical page-route resolver must not trigger workspaces.list.
    // Other features (workspace switcher, etc.) may call it independently,
    // but the page-route bootstrap never does.
    expect(workspacesListCalls).toHaveLength(0);

    expect(pageErrors).toEqual([]);
  });
});
