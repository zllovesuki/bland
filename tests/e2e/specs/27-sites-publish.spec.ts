import type { APIRequestContext, Page as PlaywrightPage } from "@playwright/test";
import {
  test,
  expect,
  createTestPage,
  createTestWorkspace,
  waitForDocEditorReady,
  waitForPersistedSnapshot,
  waitForTitleProjection,
} from "../fixtures/bland-test";

function siteOrigin(baseUrl: string, slug: string): string {
  const { port } = new URL(baseUrl);
  return `http://${slug}.bland.localhost${port ? `:${port}` : ""}`;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function patchSite(
  request: APIRequestContext,
  accessToken: string,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  const res = await request.patch(`/api/v1/workspaces/${workspaceId}/site`, {
    data: body,
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) throw new Error(`PATCH site failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<{ site: { slug: string; published_at: string | null; home_page_id: string | null } }>;
}

async function publishPage(
  request: APIRequestContext,
  accessToken: string,
  workspaceId: string,
  pageId: string,
): Promise<void> {
  const res = await request.post(`/api/v1/workspaces/${workspaceId}/site/pages/${pageId}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) throw new Error(`Publish page failed: ${res.status()} ${await res.text()}`);
}

async function unpublishPage(
  request: APIRequestContext,
  accessToken: string,
  workspaceId: string,
  pageId: string,
): Promise<void> {
  const res = await request.delete(`/api/v1/workspaces/${workspaceId}/site/pages/${pageId}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) throw new Error(`Unpublish page failed: ${res.status()} ${await res.text()}`);
}

async function readPageUpdatedAt(
  request: APIRequestContext,
  accessToken: string,
  workspaceId: string,
  pageId: string,
): Promise<string> {
  const res = await request.get(`/api/v1/workspaces/${workspaceId}/pages/${pageId}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) throw new Error(`Read page failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { page: { updated_at: string } };
  return body.page.updated_at;
}

async function waitForPageUpdatedAfter(
  request: APIRequestContext,
  accessToken: string,
  workspaceId: string,
  pageId: string,
  previousUpdatedAt: string,
): Promise<void> {
  await expect
    .poll(() => readPageUpdatedAt(request, accessToken, workspaceId, pageId), {
      timeout: 30_000,
      intervals: [500, 1000, 1500, 2000],
    })
    .not.toBe(previousUpdatedAt);
}

async function typeIntoEditor(
  page: PlaywrightPage,
  accessToken: string,
  workspaceId: string,
  workspaceSlug: string,
  pageId: string,
  text: string,
): Promise<void> {
  const previousUpdatedAt = await readPageUpdatedAt(page.request, accessToken, workspaceId, pageId);
  await page.goto(`/${workspaceSlug}/${pageId}`);
  const editor = await waitForDocEditorReady(page, { editable: true });
  await editor.click();
  await page.keyboard.type(text);
  await expect(editor).toContainText(text);
  await waitForDocEditorReady(page, { editable: true, connected: true });
  await waitForPersistedSnapshot(page, accessToken, { workspaceId, pageId, expectedText: text });
  await waitForPageUpdatedAfter(page.request, accessToken, workspaceId, pageId, previousUpdatedAt);
  // The save-side page projection is queued after the D1 metadata mirror. There
  // is no non-public R2 readiness endpoint in the E2E harness, so cover the
  // configured 5s queue batch timeout before first public navigation to avoid
  // poisoning the public HTML cache with the create-time empty artifact.
  await page.waitForTimeout(6500);
}

async function retitlePage(
  page: PlaywrightPage,
  accessToken: string,
  workspaceId: string,
  workspaceSlug: string,
  pageId: string,
  title: string,
): Promise<void> {
  await page.goto(`/${workspaceSlug}/${pageId}`);
  const titleInput = page.locator("main textarea[placeholder='Untitled']");
  await titleInput.waitFor({ timeout: 30_000 });
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(title);
  await expect(titleInput).toHaveValue(title);
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });
  await waitForTitleProjection(page, accessToken, { workspaceId, pageId, title });
}

async function gotoPublicDocWhenReady(
  page: PlaywrightPage,
  url: string,
  expectedTitle: string,
  expectedBody: string,
): Promise<void> {
  await expect(async () => {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1.site-title")).toHaveText(expectedTitle, { timeout: 1000 });
    await expect(page.locator(".tiptap")).toContainText(expectedBody, { timeout: 1000 });
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
}

test.describe("sites - publish flow", () => {
  test("owner publishes pages and cached public HTML can remain stale until TTL", async ({
    authenticatedPage: { page, accessToken },
    e2eContext,
    browser,
  }) => {
    const workspace = await createTestWorkspace(page, accessToken, "Sites Publish");
    const home = await createTestPage(page, accessToken, "Welcome", workspace);
    const subpage = await createTestPage(page, accessToken, "Sub Page", workspace);

    await typeIntoEditor(
      page,
      accessToken,
      workspace.workspaceId,
      workspace.workspaceSlug,
      home.pageId,
      "Welcome to the published site.",
    );
    await typeIntoEditor(
      page,
      accessToken,
      workspace.workspaceId,
      workspace.workspaceSlug,
      subpage.pageId,
      "Sub page body content here.",
    );

    const slug = `e2e-${Date.now().toString(36)}`;
    await patchSite(page.request, accessToken, workspace.workspaceId, { slug, published: true });

    await publishPage(page.request, accessToken, workspace.workspaceId, home.pageId);
    await publishPage(page.request, accessToken, workspace.workspaceId, subpage.pageId);

    await patchSite(page.request, accessToken, workspace.workspaceId, { home_page_id: home.pageId });

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const subpagePublicId = subpage.pageId.toLowerCase();

    try {
      const homeUrl = `${siteOrigin(e2eContext.baseUrl, slug)}/`;
      await gotoPublicDocWhenReady(anonPage, homeUrl, "Welcome", "Welcome to the published site.");

      const subUrl = `${siteOrigin(e2eContext.baseUrl, slug)}/sub-page-${subpagePublicId}`;
      await gotoPublicDocWhenReady(anonPage, subUrl, "Sub Page", "Sub page body content here.");

      // Retitle the subpage. Previously cached public HTML is allowed to stay
      // stale until the internal Sites cache TTL expires.
      await retitlePage(
        page,
        accessToken,
        workspace.workspaceId,
        workspace.workspaceSlug,
        subpage.pageId,
        "Renamed Page",
      );
      const staleRenamedRes = await anonPage.request.get(subUrl, { maxRedirects: 0 });
      expect(staleRenamedRes.status()).toBe(200);
      const staleRenamedHtml = await staleRenamedRes.text();
      expect(staleRenamedHtml).toContain("Sub Page");
      expect(staleRenamedHtml).toContain("Sub page body content here.");

      const uncachedRenamedRes = await anonPage.request.get(
        `${siteOrigin(e2eContext.baseUrl, slug)}/stale-sub-page-${subpagePublicId}`,
        { maxRedirects: 0 },
      );
      expect(uncachedRenamedRes.status()).toBe(302);
      expect(uncachedRenamedRes.headers()["location"]).toContain(`/renamed-page-${subpagePublicId}`);

      // Unpublishing the subpage makes an uncached canonical URL 404.
      await unpublishPage(page.request, accessToken, workspace.workspaceId, subpage.pageId);
      const goneRes = await anonPage.request.get(
        `${siteOrigin(e2eContext.baseUrl, slug)}/renamed-page-${subpagePublicId}`,
      );
      expect(goneRes.status()).toBe(404);

      // Home stays reachable.
      const stillHome = await anonPage.request.get(homeUrl);
      expect(stillHome.status()).toBe(200);

      // Disabling the site can still leave previously cached HTML visible, but
      // uncached public URLs fail closed.
      await patchSite(page.request, accessToken, workspace.workspaceId, { published: false });
      const staleHome = await anonPage.request.get(homeUrl);
      expect(staleHome.status()).toBe(200);
      const offline = await anonPage.request.get(
        `${siteOrigin(e2eContext.baseUrl, slug)}/uncached-${home.pageId.toLowerCase()}`,
      );
      expect(offline.status()).toBe(404);
    } finally {
      await anonContext.close();
    }
  });
});
