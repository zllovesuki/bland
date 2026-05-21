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
 * Drive a tessera sign-in via the browser context's request surface. The mock
 * OIDC provider auto-approves the authorize request and the callback issues a
 * refresh cookie, so by the time we call /auth/refresh the cookie jar is
 * authenticated and we can capture the access token for downstream API helpers.
 */
export async function loginPage(page: Page): Promise<{ accessToken: string }> {
  await runOidcFlow(page, "/");
  return refreshAndCaptureToken(page);
}

export interface FreshTesseraIdentity {
  sub: string;
  email: string;
  name?: string;
}

/**
 * Configure the mock OIDC provider to return the given identity for the next
 * authorization request, then drive a sign-in. Used by specs that exercise
 * first-time-login or sub-swap behavior without colliding with the baseline
 * identity seeded in global-setup.
 */
export async function loginAsFreshTesseraUser(
  page: Page,
  identity: FreshTesseraIdentity,
  returnTo = "/",
): Promise<{ accessToken: string }> {
  await setMockOidcIdentity(page, { ...identity, email_verified: true });
  await runOidcFlow(page, returnTo);
  return refreshAndCaptureToken(page);
}

async function runOidcFlow(page: Page, returnTo: string): Promise<void> {
  // page.goto exercises the real browser cookie jar, which treats
  // http://127.0.0.1 as a secure context and accepts __Host- cookies. The
  // page-context request API does not, so it would drop the tx cookie.
  const startUrl = `/api/v1/oidc/start?return_to=${encodeURIComponent(returnTo)}`;
  const response = await page.goto(startUrl, { waitUntil: "load" });
  if (!response) {
    throw new Error("OIDC flow returned no response");
  }
  if (!response.ok()) {
    throw new Error(`OIDC flow failed: ${response.status()} ${await response.text()}`);
  }
}

async function refreshAndCaptureToken(page: Page): Promise<{ accessToken: string }> {
  // Run the refresh from inside the page so the browser sends the Secure
  // bland_refresh cookie. page.request would otherwise drop the cookie since
  // Node fetch does not honor the loopback secure-context exception.
  const result = (await page.evaluate(async () => {
    const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  })) as { ok: boolean; status: number; body: string };

  if (!result.ok) {
    throw new Error(`Auth refresh failed: ${result.status} ${result.body}`);
  }
  const parsed = JSON.parse(result.body) as { accessToken: string };
  return { accessToken: parsed.accessToken };
}

async function setMockOidcIdentity(
  page: Page,
  identity: { sub: string; email: string; name?: string; email_verified: boolean },
): Promise<void> {
  const contextPath = process.env[E2E_CONTEXT_PATH_ENV]!;
  const raw = await readFile(contextPath, "utf8");
  const ctx = JSON.parse(raw) as E2eContextFile;
  const params = new URLSearchParams({
    sub: identity.sub,
    email: identity.email,
    email_verified: identity.email_verified ? "true" : "false",
  });
  if (identity.name) params.set("name", identity.name);
  const res = await page.request.get(`${ctx.oidcIssuer}/__test/identity?${params.toString()}`);
  if (!res.ok()) {
    throw new Error(`Failed to set mock OIDC identity: ${res.status()} ${await res.text()}`);
  }
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
