import { test as base, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
}

export const test = base.extend<BlandFixtures>({
  e2eContext: async ({}, use: (ctx: E2eContextFile) => Promise<void>) => {
    const contextPath = process.env[E2E_CONTEXT_PATH_ENV]!;
    const raw = await readFile(contextPath, "utf8");
    await use(JSON.parse(raw) as E2eContextFile);
  },

  authenticatedPage: async ({ page }, use) => {
    const { accessToken } = await loginPage(page);
    await use({ page, accessToken });
  },
});

export { expect } from "@playwright/test";

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

export async function createTestWorkspace(page: Page, accessToken: string, namePrefix = "E2E Test Workspace") {
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
): Promise<TestPage> {
  const targetWorkspace = workspace ?? (await getWorkspaceBySlug(page, accessToken, TEST_CREDENTIALS.workspaceSlug));

  // Create a page
  const pageRes = await page.request.post(`/api/v1/workspaces/${targetWorkspace.workspaceId}/pages`, {
    data: { title: title ?? `E2E Test Page ${Date.now()}` },
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
