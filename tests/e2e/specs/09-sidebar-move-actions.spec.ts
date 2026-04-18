import type { Locator, Page } from "@playwright/test";
import { test, expect, createTestWorkspace } from "../fixtures/bland-test";

interface ApiPage {
  id: string;
  parent_id: string | null;
  position: number;
  title: string;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function createPage(
  page: Page,
  accessToken: string,
  workspaceId: string,
  title: string,
  parentId?: string,
): Promise<ApiPage> {
  const data: Record<string, unknown> = { title };
  if (parentId) data.parent_id = parentId;
  const res = await page.request.post(`/api/v1/workspaces/${workspaceId}/pages`, {
    data,
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) throw new Error(`Failed to create page "${title}": ${res.status()}`);
  const body = (await res.json()) as { page: ApiPage };
  return body.page;
}

async function listPages(page: Page, accessToken: string, workspaceId: string): Promise<ApiPage[]> {
  const res = await page.request.get(`/api/v1/workspaces/${workspaceId}/pages`, {
    headers: authHeaders(accessToken),
  });
  const data = (await res.json()) as { pages: ApiPage[] };
  return data.pages;
}

function rowLocator(page: Page, pageId: string): Locator {
  return page.locator(`[data-page-row][data-page-id="${pageId}"]`);
}

async function expandRow(page: Page, pageId: string): Promise<void> {
  const row = rowLocator(page, pageId);
  const chevron = row.locator('button[aria-label="Expand"]');
  if (await chevron.count()) {
    await chevron.click().catch(() => {});
  }
}

async function openRowMenu(page: Page, pageId: string): Promise<void> {
  const row = rowLocator(page, pageId);
  await row.locator('button[aria-label="Page options"]').click();
}

async function clickMenuItem(page: Page, label: string): Promise<void> {
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

test.describe("sidebar move actions", () => {
  test("reorders root pages with Move down", async ({ authenticatedPage: { page, accessToken } }) => {
    const workspace = await createTestWorkspace(page, accessToken, "Move Actions");
    const a = await createPage(page, accessToken, workspace.workspaceId, "Root A");
    const b = await createPage(page, accessToken, workspace.workspaceId, "Root B");
    const c = await createPage(page, accessToken, workspace.workspaceId, "Root C");

    await page.goto(`/${workspace.workspaceSlug}`);
    await rowLocator(page, a.id).waitFor({ timeout: 15_000 });
    await rowLocator(page, c.id).waitFor({ timeout: 15_000 });

    await openRowMenu(page, b.id);
    await clickMenuItem(page, "Move down");

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspace.workspaceId);
          return pages
            .filter((candidate) => [a.id, b.id, c.id].includes(candidate.id) && candidate.parent_id === null)
            .sort((x, y) => x.position - y.position)
            .map((candidate) => candidate.id);
        },
        { timeout: 15_000 },
      )
      .toEqual([a.id, c.id, b.id]);
  });

  test("indents a page into the previous sibling", async ({ authenticatedPage: { page, accessToken } }) => {
    const workspace = await createTestWorkspace(page, accessToken, "Move Actions");
    const parent = await createPage(page, accessToken, workspace.workspaceId, "Parent");
    const sibling = await createPage(page, accessToken, workspace.workspaceId, "Sibling");

    await page.goto(`/${workspace.workspaceSlug}`);
    await rowLocator(page, parent.id).waitFor({ timeout: 15_000 });
    await rowLocator(page, sibling.id).waitFor({ timeout: 15_000 });

    await openRowMenu(page, sibling.id);
    await clickMenuItem(page, "Indent");

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspace.workspaceId);
          return pages.find((candidate) => candidate.id === sibling.id)?.parent_id ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe(parent.id);
  });

  test("outdents a child to after its former parent subtree", async ({ authenticatedPage: { page, accessToken } }) => {
    const workspace = await createTestWorkspace(page, accessToken, "Move Actions");
    const parent = await createPage(page, accessToken, workspace.workspaceId, "Outdent Parent");
    const childOne = await createPage(page, accessToken, workspace.workspaceId, "Child One", parent.id);
    const childTwo = await createPage(page, accessToken, workspace.workspaceId, "Child Two", parent.id);
    const tail = await createPage(page, accessToken, workspace.workspaceId, "Tail Root");

    await page.goto(`/${workspace.workspaceSlug}`);
    await rowLocator(page, parent.id).waitFor({ timeout: 15_000 });
    await expandRow(page, parent.id);
    await rowLocator(page, childOne.id).waitFor({ timeout: 15_000 });

    await openRowMenu(page, childOne.id);
    await clickMenuItem(page, "Outdent");

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspace.workspaceId);
          const rootOrder = pages
            .filter(
              (candidate) => [parent.id, childOne.id, tail.id].includes(candidate.id) && candidate.parent_id === null,
            )
            .sort((x, y) => x.position - y.position)
            .map((candidate) => candidate.id);
          const remainingChildren = pages
            .filter(
              (candidate) => [childOne.id, childTwo.id].includes(candidate.id) && candidate.parent_id === parent.id,
            )
            .sort((x, y) => x.position - y.position)
            .map((candidate) => candidate.id);
          return { rootOrder, remainingChildren };
        },
        { timeout: 15_000 },
      )
      .toEqual({
        rootOrder: [parent.id, childOne.id, tail.id],
        remainingChildren: [childTwo.id],
      });
  });

  test("moves a page into another branch with Move…", async ({ authenticatedPage: { page, accessToken } }) => {
    const workspace = await createTestWorkspace(page, accessToken, "Move Actions");
    const alpha = await createPage(page, accessToken, workspace.workspaceId, "Alpha");
    const beta = await createPage(page, accessToken, workspace.workspaceId, "Beta");

    await page.goto(`/${workspace.workspaceSlug}`);
    await rowLocator(page, alpha.id).waitFor({ timeout: 15_000 });
    await rowLocator(page, beta.id).waitFor({ timeout: 15_000 });

    await openRowMenu(page, beta.id);
    await clickMenuItem(page, "Move…");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button").filter({ hasText: "Alpha" }).first().click();
    await dialog.getByRole("button", { name: "Inside", exact: true }).click();
    await dialog.getByRole("button", { name: "Move", exact: true }).click();

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspace.workspaceId);
          return pages.find((candidate) => candidate.id === beta.id)?.parent_id ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe(alpha.id);
  });
});
