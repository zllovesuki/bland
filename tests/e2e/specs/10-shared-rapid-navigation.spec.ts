import type { Page as PlaywrightPage } from "@playwright/test";
import { test, expect, createTestPage, createShareLink } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

interface SharedPageNode {
  id: string;
  title: string;
}

interface SharedNavigationFixture {
  root: {
    pageId: string;
    workspaceId: string;
    workspaceSlug: string;
  };
  share: {
    token: string;
    permission: "view" | "edit";
  };
  children: [SharedPageNode, SharedPageNode, SharedPageNode];
  rootBodyText: string;
}

const ROOT_TITLE = "Shared Root";
const ROOT_BODY_TEXT = "Root remains view only";
const CHILD_TITLES = ["Child Alpha", "Child Beta", "Child Gamma"] as const;
const SHARED_PAGE_METADATA_DELAY_MS = 1_200;

async function createChildPage(
  page: PlaywrightPage,
  accessToken: string,
  workspaceId: string,
  parentId: string,
  title: string,
): Promise<SharedPageNode> {
  const res = await page.request.post(`/api/v1/workspaces/${workspaceId}/pages`, {
    data: { title, parent_id: parentId },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create child page "${title}": ${res.status()}`);
  }

  const data = (await res.json()) as { page: { id: string } };
  return { id: data.page.id, title };
}

async function expectSharedUrl(page: PlaywrightPage, token: string, pageId?: string) {
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(`/s/${token}`);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"), {
      timeout: 10_000,
      message: pageId ? `URL should settle on shared child ${pageId}` : "URL should drop ?page= on shared root",
    })
    .toBe(pageId ?? null);
}

function sharedTitleField(page: PlaywrightPage) {
  return page.locator("main textarea[placeholder='Untitled']");
}

function isSharedPageMetadataRequest(url: string, workspaceId: string, pageId: string, shareToken: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.pathname === `/api/v1/workspaces/${workspaceId}/pages/${pageId}` &&
    parsed.searchParams.get("share") === shareToken
  );
}

async function setupSharedNavigationFixture(
  page: PlaywrightPage,
  accessToken: string,
): Promise<SharedNavigationFixture> {
  const root = await createTestPage(page, accessToken, ROOT_TITLE);
  const children = (await Promise.all(
    CHILD_TITLES.map((title) => createChildPage(page, accessToken, root.workspaceId, root.pageId, title)),
  )) as [SharedPageNode, SharedPageNode, SharedPageNode];

  await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${root.pageId}`);

  const rootEditor = page.locator(".tiptap[contenteditable='true']");
  await rootEditor.waitFor({ timeout: 30_000 });
  await rootEditor.click();
  await page.keyboard.type(ROOT_BODY_TEXT);
  await expect(rootEditor).toContainText(ROOT_BODY_TEXT);
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

  const share = await createShareLink(page, accessToken, root.pageId, "view");

  return { root, share, children, rootBodyText: ROOT_BODY_TEXT };
}

test.describe("rapid page navigation - shared view", () => {
  test("anonymous shared navigation settles without freezing", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const { share, children } = await setupSharedNavigationFixture(page, accessToken);
    const [childAlpha, childBeta] = children;

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();

    const pageErrors: string[] = [];
    anonPage.on("pageerror", (err) => pageErrors.push(err.message));

    await anonPage.goto(`/s/${share.token}`);

    const sharedEditor = anonPage.locator(".tiptap");
    const sharedTitle = sharedTitleField(anonPage);
    await sharedEditor.waitFor({ timeout: 30_000 });
    await expectSharedUrl(anonPage, share.token);
    await expect(sharedTitle).toHaveValue(ROOT_TITLE, { timeout: 10_000 });

    const childAlphaLink = anonPage.locator("button").filter({ hasText: childAlpha.title }).first();
    const childBetaLink = anonPage.locator("button").filter({ hasText: childBeta.title }).first();
    await childAlphaLink.waitFor({ timeout: 15_000 });

    await childAlphaLink.click();
    await expectSharedUrl(anonPage, share.token, childAlpha.id);

    await childBetaLink.click();
    await expectSharedUrl(anonPage, share.token, childBeta.id);

    await sharedEditor.waitFor({ timeout: 30_000 });
    await expect(sharedTitle).toHaveValue(childBeta.title, { timeout: 10_000 });

    const rootLink = anonPage.locator("button").filter({ hasText: ROOT_TITLE }).first();
    await rootLink.click();

    await expectSharedUrl(anonPage, share.token);
    await expect(sharedTitle).toHaveValue(ROOT_TITLE, { timeout: 10_000 });
    await expect(sharedEditor).toBeVisible({ timeout: 15_000 });
    expect(pageErrors).toEqual([]);

    await anonContext.close();
  });

  test("authenticated member rapid navigation keeps shared root read-only and subpages editable", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const { share, children, rootBodyText } = await setupSharedNavigationFixture(page, accessToken);
    const [childAlpha, childBeta, childGamma] = children;

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(`/s/${share.token}`);

    const rootEditor = page.locator(".tiptap[contenteditable='false']");
    const sharedTitle = sharedTitleField(page);
    await rootEditor.waitFor({ timeout: 30_000 });
    await expectSharedUrl(page, share.token);
    await expect(sharedTitle).toHaveValue(ROOT_TITLE, { timeout: 10_000 });
    await expect(rootEditor).toContainText(rootBodyText);

    const rootContentBefore = await rootEditor.textContent();
    await rootEditor.click();
    await page.keyboard.type("should not appear on root");
    await expect(rootEditor).toHaveAttribute("contenteditable", "false");
    expect(await rootEditor.textContent()).toBe(rootContentBefore);

    const childAlphaLink = page.locator("button").filter({ hasText: childAlpha.title }).first();
    const childBetaLink = page.locator("button").filter({ hasText: childBeta.title }).first();
    const childGammaLink = page.locator("button").filter({ hasText: childGamma.title }).first();
    await childAlphaLink.waitFor({ timeout: 15_000 });

    await childAlphaLink.click();
    await expectSharedUrl(page, share.token, childAlpha.id);

    await childBetaLink.click();
    await childGammaLink.click();
    await expectSharedUrl(page, share.token, childGamma.id);

    const childEditor = page.locator(".tiptap[contenteditable='true']");
    await childEditor.waitFor({ timeout: 30_000 });
    await expect(sharedTitle).toHaveValue(childGamma.title, { timeout: 10_000 });

    await childEditor.click();
    await page.keyboard.type("Editable child content");
    await expect(childEditor).toContainText("Editable child content");

    const rootLink = page.locator("button").filter({ hasText: ROOT_TITLE }).first();
    await rootLink.click();

    await expectSharedUrl(page, share.token);
    const returnedRootEditor = page.locator(".tiptap[contenteditable='false']");
    await returnedRootEditor.waitFor({ timeout: 30_000 });
    await expect(sharedTitle).toHaveValue(ROOT_TITLE, { timeout: 10_000 });
    await expect(returnedRootEditor).toContainText(rootBodyText);
    expect(pageErrors).toEqual([]);
  });

  test("authenticated member root-child-root races keep the shared root responsive", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const { root, share, children, rootBodyText } = await setupSharedNavigationFixture(page, accessToken);
    const [delayedChild] = children;

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.route("**/api/v1/workspaces/**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      if (isSharedPageMetadataRequest(route.request().url(), root.workspaceId, delayedChild.id, share.token)) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, SHARED_PAGE_METADATA_DELAY_MS);
        });
        await route.continue();
        return;
      }

      await route.continue();
    });

    await page.goto(`/s/${share.token}`);

    const rootEditor = page.locator(".tiptap[contenteditable='false']");
    const sharedTitle = sharedTitleField(page);
    const childLink = page.locator("button").filter({ hasText: delayedChild.title }).first();
    const rootLink = page.locator("button").filter({ hasText: ROOT_TITLE }).first();

    await rootEditor.waitFor({ timeout: 30_000 });
    await expectSharedUrl(page, share.token);
    await expect(sharedTitle).toHaveValue(ROOT_TITLE, { timeout: 10_000 });
    await expect(rootEditor).toContainText(rootBodyText);
    await childLink.waitFor({ timeout: 15_000 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await childLink.click();
      await expectSharedUrl(page, share.token, delayedChild.id);

      await rootLink.click();
      await expectSharedUrl(page, share.token);
      await expect(sharedTitle).toHaveValue(ROOT_TITLE, { timeout: 10_000 });
      await expect(rootEditor).toBeVisible({ timeout: 30_000 });
    }

    await rootEditor.waitFor({ timeout: 30_000 });
    const rootContentBefore = await rootEditor.textContent();
    await rootEditor.click();
    await page.keyboard.type("still read only on root");
    await expect(rootEditor).toHaveAttribute("contenteditable", "false");
    expect(await rootEditor.textContent()).toBe(rootContentBefore);

    await childLink.click();
    await expectSharedUrl(page, share.token, delayedChild.id);

    const childEditor = page.locator(".tiptap[contenteditable='true']");
    await childEditor.waitFor({ timeout: 30_000 });
    await childEditor.click();
    await page.keyboard.type("Delayed child remains editable");
    await expect(childEditor).toContainText("Delayed child remains editable");

    expect(pageErrors).toEqual([]);
  });
});
