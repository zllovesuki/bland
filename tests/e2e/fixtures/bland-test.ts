import { test as base, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { E2E_CONTEXT_PATH_ENV, type E2eContextFile } from "../global-setup";
import { TEST_CREDENTIALS } from "../harness";

export interface TestPage {
  pageId: string;
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
    // Log in via API through the browser context's request surface.
    // page.request shares cookies with the browser context, so the
    // Set-Cookie: bland_refresh=... lands in the context cookie jar.
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
    const body = (await res.json()) as { accessToken: string };
    await use({ page, accessToken: body.accessToken });
  },
});

export { expect } from "@playwright/test";

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Create a page via API and return its metadata. */
export async function createTestPage(page: Page, accessToken: string, title?: string): Promise<TestPage> {
  // Get the workspace ID from the workspaces list
  const wsRes = await page.request.get("/api/v1/workspaces", {
    headers: authHeaders(accessToken),
  });
  if (!wsRes.ok()) throw new Error(`Failed to list workspaces: ${wsRes.status()}`);
  const wsData = (await wsRes.json()) as { workspaces: Array<{ id: string; slug: string }> };
  const workspace = wsData.workspaces[0];
  if (!workspace) throw new Error("No workspaces found");

  // Create a page
  const pageRes = await page.request.post(`/api/v1/workspaces/${workspace.id}/pages`, {
    data: { title: title ?? `E2E Test Page ${Date.now()}` },
    headers: authHeaders(accessToken),
  });
  if (!pageRes.ok()) throw new Error(`Failed to create page: ${pageRes.status()}`);
  const pageData = (await pageRes.json()) as { page: { id: string } };

  return {
    pageId: pageData.page.id,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
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
