import { expect, test as base, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import * as Y from "yjs";
import { extractPlaintext } from "@/shared/editor/yjs-text";
import { E2E_CONTEXT_PATH_ENV, type E2eContextFile } from "../global-setup";
import { TEST_CREDENTIALS } from "../harness";

export interface TestPage {
  pageId: string;
  workspaceId: string;
  workspaceSlug: string;
}

export interface TestWorkspace {
  workspaceId: string;
  workspaceSlug: string;
}

export interface ShareLink {
  token: string;
  permission: "view" | "edit";
}

export interface AuthenticatedPage {
  page: Page;
  accessToken: string;
}

interface BlandFixtures {
  e2eContext: E2eContextFile;
  authenticatedPage: AuthenticatedPage;
  e2eWorkspace: TestWorkspace;
}

export const test = base.extend<BlandFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring here.
  e2eContext: async ({}, use: (ctx: E2eContextFile) => Promise<void>) => {
    const contextPath = process.env[E2E_CONTEXT_PATH_ENV]!;
    const raw = await readFile(contextPath, "utf8");
    await use(JSON.parse(raw) as E2eContextFile);
  },

  authenticatedPage: async ({ page }, use) => {
    const { accessToken } = await loginPage(page);
    await use({ page, accessToken });
  },

  e2eWorkspace: async ({ authenticatedPage }, use) => {
    const workspace = await createTestWorkspace(authenticatedPage.page, authenticatedPage.accessToken);
    await use(workspace);
  },
});

export { expect };

/**
 * Log in via the browser context's request surface. page.request shares cookies
 * with the browser context, so the Set-Cookie: bland_refresh=... lands in the
 * context cookie jar — the subsequent page.goto() is then authenticated.
 */
export async function loginPage(page: Page): Promise<{ accessToken: string }> {
  const res = await page.request.post("/api/v1/auth/login", {
    data: {
      email: TEST_CREDENTIALS.email,
      password: TEST_CREDENTIALS.password,
      turnstileToken: "test",
    },
  });
  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { accessToken: string };
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function getWorkspaceBySlug(page: Page, accessToken: string, workspaceSlug: string): Promise<TestWorkspace> {
  const wsRes = await page.request.get("/api/v1/workspaces", {
    headers: authHeaders(accessToken),
  });
  if (!wsRes.ok()) throw new Error(`Failed to list workspaces: ${wsRes.status()}`);
  const wsData = (await wsRes.json()) as { workspaces: Array<{ id: string; slug: string }> };
  const workspace = wsData.workspaces.find((candidate) => candidate.slug === workspaceSlug);
  if (!workspace) throw new Error(`Workspace not found: ${workspaceSlug}`);

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
  };
}

export async function createTestWorkspace(
  page: Page,
  accessToken: string,
  namePrefix = "E2E Test Workspace",
): Promise<TestWorkspace> {
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceName = `${namePrefix} ${uniqueSuffix}`;
  const workspaceSlug = `e2e-${uniqueSuffix}`;
  const res = await page.request.post("/api/v1/workspaces", {
    data: {
      name: workspaceName,
      slug: workspaceSlug,
    },
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) throw new Error(`Failed to create workspace: ${res.status()}`);
  const body = (await res.json()) as { workspace: { id: string; slug: string } };

  return {
    workspaceId: body.workspace.id,
    workspaceSlug: body.workspace.slug,
  };
}

/** Create a page via API and return its metadata. */
export async function createTestPage(
  page: Page,
  accessToken: string,
  title?: string,
  workspace?: TestWorkspace,
  kind: "doc" | "canvas" = "doc",
): Promise<TestPage> {
  const targetWorkspace = workspace ?? (await getWorkspaceBySlug(page, accessToken, TEST_CREDENTIALS.workspaceSlug));

  // Create a page
  const pageRes = await page.request.post(`/api/v1/workspaces/${targetWorkspace.workspaceId}/pages`, {
    data: { kind, title: title ?? `E2E Test Page ${Date.now()}` },
    headers: authHeaders(accessToken),
  });
  if (!pageRes.ok()) throw new Error(`Failed to create page: ${pageRes.status()}`);
  const pageData = (await pageRes.json()) as { page: { id: string } };

  return {
    pageId: pageData.page.id,
    workspaceId: targetWorkspace.workspaceId,
    workspaceSlug: targetWorkspace.workspaceSlug,
  };
}

/** Create a share link on a page and return the token. */
export async function createShareLink(
  page: Page,
  accessToken: string,
  pageId: string,
  permission: "view" | "edit",
): Promise<ShareLink> {
  const res = await page.request.post(`/api/v1/pages/${pageId}/share`, {
    data: {
      grantee_type: "link",
      permission,
    },
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) throw new Error(`Failed to create share: ${res.status()}`);
  const data = (await res.json()) as { share: { link_token: string } };

  return { token: data.share.link_token, permission };
}

export async function waitForDocEditorReady(page: Page, options: { editable?: boolean; connected?: boolean } = {}) {
  const selector =
    options.editable === undefined ? ".tiptap" : `.tiptap[contenteditable='${options.editable ? "true" : "false"}']`;
  const editor = page.locator(selector).first();
  await editor.waitFor({ timeout: 30_000 });
  if (options.connected) {
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });
  }
  return editor;
}

export async function waitForPersistedSnapshot(
  page: Page,
  accessToken: string,
  options: { workspaceId: string; pageId: string; minBytes?: number; expectedText?: string | string[] },
): Promise<void> {
  const minBytes = options.minBytes ?? 1;
  const expectedTexts =
    typeof options.expectedText === "string"
      ? [options.expectedText]
      : (options.expectedText ?? []).filter((text) => text.length > 0);

  const readSnapshot = async (): Promise<{ byteLength: number; text: string } | null> => {
    const res = await page.request.get(`/api/v1/workspaces/${options.workspaceId}/pages/${options.pageId}/snapshot`, {
      headers: authHeaders(accessToken),
    });
    if (res.status() === 204) return null;
    if (res.status() !== 200) {
      throw new Error(`Snapshot poll failed: ${res.status()} ${await res.text()}`);
    }
    const body = await res.body();
    return { byteLength: body.byteLength, text: expectedTexts.length > 0 ? extractSnapshotDocumentText(body) : "" };
  };

  if (expectedTexts.length > 0) {
    await expect
      .poll(
        async () => {
          const snapshot = await readSnapshot();
          if (!snapshot || snapshot.byteLength < minBytes) return false;
          return expectedTexts.every((text) => snapshot.text.includes(text));
        },
        {
          timeout: 30_000,
          intervals: [500, 1000, 1500, 2000],
          message: `persisted snapshot should include ${expectedTexts.join(", ")}`,
        },
      )
      .toBe(true);
    return;
  }

  await expect
    .poll(
      async () => {
        const snapshot = await readSnapshot();
        return snapshot?.byteLength ?? 0;
      },
      { timeout: 30_000, intervals: [500, 1000, 1500, 2000] },
    )
    .toBeGreaterThanOrEqual(minBytes);
}

function extractSnapshotDocumentText(bytes: Uint8Array): string {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, bytes);
    return extractPlaintext(doc).bodyText;
  } finally {
    doc.destroy();
  }
}

export async function waitForTitleProjection(
  page: Page,
  accessToken: string,
  options: { workspaceId: string; pageId: string; title: string },
): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/v1/workspaces/${options.workspaceId}/pages/${options.pageId}`, {
          headers: authHeaders(accessToken),
        });
        if (res.status() !== 200) {
          throw new Error(`Title projection poll failed: ${res.status()} ${await res.text()}`);
        }
        const body = (await res.json()) as { page: { title: string | null } };
        return body.page.title;
      },
      { timeout: 30_000, intervals: [500, 1000, 1500, 2000] },
    )
    .toBe(options.title);
}

export async function waitForCanvasSceneCount(page: Page, minCount: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const fn = (window as unknown as { __E2E_CANVAS_SCENE_COUNT__?: () => number }).__E2E_CANVAS_SCENE_COUNT__;
          return typeof fn === "function" ? fn() : null;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(minCount);
}

export async function expectNoChangeFor<T>(readValue: () => Promise<T> | T, durationMs = 1_000): Promise<void> {
  const initial = await readValue();
  const deadline = Date.now() + durationMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))));
    const next = await readValue();
    if (!isDeepStrictEqual(next, initial)) {
      throw new Error(`Expected value to remain unchanged for ${durationMs}ms.`);
    }
  }
}
