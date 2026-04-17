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
    await sharedEditor.waitFor({ timeout: 30_000 });
    await expectSharedUrl(anonPage, share.token);

    const headerTitle = anonPage.locator("header span").filter({ hasText: ROOT_TITLE });
    await expect(headerTitle).toBeVisible({ timeout: 10_000 });

    const childAlphaLink = anonPage.locator("button").filter({ hasText: childAlpha.title }).first();
    const childBetaLink = anonPage.locator("button").filter({ hasText: childBeta.title }).first();
    await childAlphaLink.waitFor({ timeout: 15_000 });

    await childAlphaLink.click();
    await expectSharedUrl(anonPage, share.token, childAlpha.id);

    await childBetaLink.click();
    await expectSharedUrl(anonPage, share.token, childBeta.id);

    await sharedEditor.waitFor({ timeout: 30_000 });
    const betaTitle = anonPage.locator("header span").filter({ hasText: childBeta.title });
    await expect(betaTitle).toBeVisible({ timeout: 10_000 });

    const rootLink = anonPage.locator("button").filter({ hasText: ROOT_TITLE }).first();
    await rootLink.click();

    await expectSharedUrl(anonPage, share.token);
    await expect(headerTitle).toBeVisible({ timeout: 10_000 });
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
    await rootEditor.waitFor({ timeout: 30_000 });
    await expectSharedUrl(page, share.token);
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

    const gammaTitle = page.locator("header span").filter({ hasText: childGamma.title });
    await expect(gammaTitle).toBeVisible({ timeout: 10_000 });

    await childEditor.click();
    await page.keyboard.type("Editable child content");
    await expect(childEditor).toContainText("Editable child content");

    const rootLink = page.locator("button").filter({ hasText: ROOT_TITLE }).first();
    await rootLink.click();

    await expectSharedUrl(page, share.token);
    const returnedRootEditor = page.locator(".tiptap[contenteditable='false']");
    await returnedRootEditor.waitFor({ timeout: 30_000 });
    await expect(returnedRootEditor).toContainText(rootBodyText);
    expect(pageErrors).toEqual([]);
  });
});
