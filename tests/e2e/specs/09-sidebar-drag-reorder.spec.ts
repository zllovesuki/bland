import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

interface ApiPage {
  id: string;
  parent_id: string | null;
  position: number;
  title: string;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function getWorkspaceId(page: Page, accessToken: string): Promise<string> {
  const res = await page.request.get("/api/v1/workspaces", { headers: authHeaders(accessToken) });
  const data = (await res.json()) as { workspaces: Array<{ id: string }> };
  if (!data.workspaces[0]) throw new Error("No workspace found");
  return data.workspaces[0].id;
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
  const chevron = rowLocator(page, pageId).locator('button[aria-label="Expand"]');
  if (await chevron.count()) {
    await chevron.click().catch(() => {});
  }
}

test.describe("sidebar drag-and-drop", () => {
  test("reorders root pages", async ({ authenticatedPage: { page, accessToken } }) => {
    const workspaceId = await getWorkspaceId(page, accessToken);
    const a = await createPage(page, accessToken, workspaceId, "DnD-A");
    const b = await createPage(page, accessToken, workspaceId, "DnD-B");
    const c = await createPage(page, accessToken, workspaceId, "DnD-C");

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}`);
    await rowLocator(page, a.id).waitFor({ timeout: 15_000 });
    await rowLocator(page, c.id).waitFor({ timeout: 15_000 });

    const cBox = await rowLocator(page, c.id).boundingBox();
    if (!cBox) throw new Error("No bounding box for C");

    await rowLocator(page, a.id).dragTo(rowLocator(page, c.id), {
      targetPosition: { x: 10, y: cBox.height - 4 },
    });

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspaceId);
          return pages
            .filter((p) => [a.id, b.id, c.id].includes(p.id) && p.parent_id === null)
            .sort((x, y) => x.position - y.position)
            .map((p) => p.id);
        },
        { timeout: 15_000 },
      )
      .toEqual([b.id, c.id, a.id]);
  });

  test("nests a root page as a child via horizontal X offset", async ({ authenticatedPage: { page, accessToken } }) => {
    const workspaceId = await getWorkspaceId(page, accessToken);
    const parent = await createPage(page, accessToken, workspaceId, "DnD-Parent");
    const child = await createPage(page, accessToken, workspaceId, "DnD-Child");

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}`);
    await rowLocator(page, parent.id).waitFor({ timeout: 15_000 });
    await rowLocator(page, child.id).waitFor({ timeout: 15_000 });

    const parentBox = await rowLocator(page, parent.id).boundingBox();
    if (!parentBox) throw new Error("No bounding box for parent");

    // Sidebar is 260px wide; thirds split at ~87 and ~173. X=200 lands firmly
    // in the child zone (right third) so the drop resolves to "nest as child".
    await rowLocator(page, child.id).dragTo(rowLocator(page, parent.id), {
      targetPosition: { x: 200, y: parentBox.height / 2 + 2 },
    });

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspaceId);
          return pages.find((p) => p.id === child.id)?.parent_id ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe(parent.id);
  });

  test("inserts into the visible gap before a parent's first child", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const workspaceId = await getWorkspaceId(page, accessToken);
    const parent = await createPage(page, accessToken, workspaceId, "DnD-Gap-Parent");
    const firstChild = await createPage(page, accessToken, workspaceId, "DnD-Gap-Child-1", parent.id);
    const secondChild = await createPage(page, accessToken, workspaceId, "DnD-Gap-Child-2", parent.id);
    const moving = await createPage(page, accessToken, workspaceId, "DnD-Gap-Moving");

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}`);
    await rowLocator(page, parent.id).waitFor({ timeout: 15_000 });
    await expandRow(page, parent.id);
    await rowLocator(page, firstChild.id).waitFor({ timeout: 15_000 });

    await rowLocator(page, moving.id).dragTo(rowLocator(page, firstChild.id), {
      targetPosition: { x: 200, y: 2 },
    });

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspaceId);
          const movingPage = pages.find((p) => p.id === moving.id);
          const childOrder = pages
            .filter((p) => [moving.id, firstChild.id, secondChild.id].includes(p.id) && p.parent_id === parent.id)
            .sort((x, y) => x.position - y.position)
            .map((p) => p.id);
          return { parentId: movingPage?.parent_id ?? null, childOrder };
        },
        { timeout: 15_000 },
      )
      .toEqual({
        parentId: parent.id,
        childOrder: [moving.id, firstChild.id, secondChild.id],
      });
  });

  test("maps a root-zone drop before a descendant row to before that root subtree", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const workspaceId = await getWorkspaceId(page, accessToken);
    const parent = await createPage(page, accessToken, workspaceId, "DnD-Root-Gap-Parent");
    const firstChild = await createPage(page, accessToken, workspaceId, "DnD-Root-Gap-Child-1", parent.id);
    await createPage(page, accessToken, workspaceId, "DnD-Root-Gap-Child-2", parent.id);
    const moving = await createPage(page, accessToken, workspaceId, "DnD-Root-Gap-Moving");

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}`);
    await rowLocator(page, parent.id).waitFor({ timeout: 15_000 });
    await expandRow(page, parent.id);
    await rowLocator(page, firstChild.id).waitFor({ timeout: 15_000 });

    await rowLocator(page, moving.id).dragTo(rowLocator(page, firstChild.id), {
      targetPosition: { x: 20, y: 2 },
    });

    await expect
      .poll(
        async () => {
          const pages = await listPages(page, accessToken, workspaceId);
          return pages
            .filter((p) => [moving.id, parent.id].includes(p.id) && p.parent_id === null)
            .sort((x, y) => x.position - y.position)
            .map((p) => p.id);
        },
        { timeout: 15_000 },
      )
      .toEqual([moving.id, parent.id]);
  });

  test("refuses to nest a page inside its own subtree", async ({ authenticatedPage: { page, accessToken } }) => {
    const workspaceId = await getWorkspaceId(page, accessToken);
    const parent = await createPage(page, accessToken, workspaceId, "DnD-Cycle-Parent");
    const child = await createPage(page, accessToken, workspaceId, "DnD-Cycle-Child", parent.id);

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}`);
    await rowLocator(page, parent.id).waitFor({ timeout: 15_000 });
    await expandRow(page, parent.id);
    await rowLocator(page, child.id).waitFor({ timeout: 15_000 });

    const childBox = await rowLocator(page, child.id).boundingBox();
    if (!childBox) throw new Error("No bounding box for child");

    // X=200 lands in the child zone so the resolver attempts intent=child —
    // which for (dragged=parent, anchor=child) would set parent_id=child.id
    // and trip the cycle guard.
    await rowLocator(page, parent.id).dragTo(rowLocator(page, child.id), {
      targetPosition: { x: 200, y: childBox.height / 2 + 2 },
    });

    await page.waitForTimeout(1_000);

    const pages = await listPages(page, accessToken, workspaceId);
    const parentAfter = pages.find((p) => p.id === parent.id);
    expect(parentAfter?.parent_id).toBeNull();
  });
});
