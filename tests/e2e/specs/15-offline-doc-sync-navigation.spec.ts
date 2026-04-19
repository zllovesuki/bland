import type { Page as PlaywrightPage } from "@playwright/test";
import { test, expect, createTestPage } from "../fixtures/bland-test";

function collectDocSyncErrors(page: PlaywrightPage): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && text.includes("/parties/doc-sync/")) {
      errors.push(text);
    }
  });
  return errors;
}

function collectSnapshotRequests(page: PlaywrightPage, pageId: string): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/pages/${pageId}/snapshot`)) {
      requests.push(request.url());
    }
  });
  return requests;
}

test.describe("offline doc sync navigation", () => {
  test("authenticated offline navigation parks doc sync on the destination page", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const [pageA, pageB] = await Promise.all([
      createTestPage(page, accessToken, "Offline Source"),
      createTestPage(page, accessToken, "Offline Target"),
    ]);

    const docSyncErrors = collectDocSyncErrors(page);

    await page.goto(`/${pageA.workspaceSlug}/${pageA.pageId}`);
    await page.locator(".tiptap").waitFor({ timeout: 30_000 });
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    await page.goto(`/${pageB.workspaceSlug}/${pageB.pageId}`);
    await page.locator(".tiptap").waitFor({ timeout: 30_000 });
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    await page.goto(`/${pageA.workspaceSlug}/${pageA.pageId}`);
    await page.locator(".tiptap").waitFor({ timeout: 30_000 });
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    await page.context().setOffline(true);
    await expect(page.getByText("Offline. Your edits are saved locally and will sync when you're back.")).toBeVisible({
      timeout: 10_000,
    });

    const errorsBeforeNavigation = docSyncErrors.length;
    const sidebarLink = page.locator("aside nav a").filter({ hasText: "Offline Target" }).first();
    await sidebarLink.click();

    await page.waitForURL(`**/${pageB.pageId}`, { timeout: 15_000 });
    await page.locator(".tiptap").waitFor({ timeout: 30_000 });
    await expect(page.getByText("Offline", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(2_000);
    expect(docSyncErrors.length).toBe(errorsBeforeNavigation);

    await page.context().setOffline(false);
  });

  test("authenticated offline navigation to an uncached page stays unavailable without snapshot bootstrap attempts", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const [pageA, pageB] = await Promise.all([
      createTestPage(page, accessToken, "Offline Cached Source"),
      createTestPage(page, accessToken, "Offline Uncached Target"),
    ]);

    const docSyncErrors = collectDocSyncErrors(page);
    const snapshotRequests = collectSnapshotRequests(page, pageB.pageId);

    await page.goto(`/${pageA.workspaceSlug}/${pageA.pageId}`);
    await page.locator(".tiptap").waitFor({ timeout: 30_000 });
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    await page.context().setOffline(true);
    await expect(page.getByText("Offline. Your edits are saved locally and will sync when you're back.")).toBeVisible({
      timeout: 10_000,
    });

    const snapshotRequestsBeforeNavigation = snapshotRequests.length;
    const errorsBeforeNavigation = docSyncErrors.length;
    const sidebarLink = page.locator("aside nav a").filter({ hasText: "Offline Uncached Target" }).first();
    await sidebarLink.click();

    await page.waitForURL(`**/${pageB.pageId}`, { timeout: 15_000 });
    await expect(page.getByText("This page isn't available offline yet.")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".tiptap")).toHaveCount(0);

    await page.waitForTimeout(2_000);
    expect(snapshotRequests.length).toBe(snapshotRequestsBeforeNavigation);
    expect(docSyncErrors.length).toBe(errorsBeforeNavigation);

    await page.context().setOffline(false);
  });
});
