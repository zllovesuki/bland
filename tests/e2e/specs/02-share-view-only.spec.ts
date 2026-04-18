import type { Page } from "@playwright/test";
import { test, expect, createTestPage, createShareLink } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0KsAAAAASUVORK5CYII=",
  "base64",
);

async function uploadTestImage(page: Page, accessToken: string, workspaceId: string, pageId: string) {
  const presignRes = await page.request.post(`/api/v1/workspaces/${workspaceId}/uploads/presign`, {
    data: {
      filename: "share-test.png",
      content_type: "image/png",
      size_bytes: ONE_BY_ONE_PNG.byteLength,
      page_id: pageId,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(presignRes.ok()).toBeTruthy();

  const presignData = (await presignRes.json()) as {
    upload: { upload_url: string; url: string };
  };

  const uploadRes = await page.request.put(presignData.upload.upload_url, {
    data: ONE_BY_ONE_PNG,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/png",
    },
  });
  expect(uploadRes.ok()).toBeTruthy();

  return presignData.upload.url;
}

test.describe("share link - view only", () => {
  test("view-only share link shows content but prevents editing", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    // Create a page and add content as the authenticated user
    const testPage = await createTestPage(page, accessToken, "Share View Test");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();
    await page.keyboard.type("Shared content visible");

    // Wait for content and sync before creating the share link
    await expect(editor).toContainText("Shared content visible");
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    // Create a view-only share link
    const share = await createShareLink(page, accessToken, testPage.pageId, "view");

    // Open the share link in a new unauthenticated browser context
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/s/${share.token}`);

    // Wait for the editor to mount in read-only mode
    const sharedEditor = anonPage.locator(".tiptap");
    await sharedEditor.waitFor({ timeout: 30_000 });

    // Verify content is visible
    await expect(sharedEditor).toContainText("Shared content visible");

    // Verify the editor is not editable
    await expect(sharedEditor).toHaveAttribute("contenteditable", "false");

    // Verify no drag handle is present (it only renders when !readOnly)
    await expect(anonPage.locator(".drag-handle")).toHaveCount(0);

    // Attempt to type and verify the content does not change
    const contentBefore = await sharedEditor.textContent();
    await sharedEditor.click();
    await anonPage.keyboard.type("should not appear");
    const contentAfter = await sharedEditor.textContent();
    expect(contentAfter).toBe(contentBefore);

    await anonContext.close();
  });

  test("shared image requests always include the share token", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const testPage = await createTestPage(page, accessToken, "Shared Image Test");
    const imageUrl = await uploadTestImage(page, accessToken, testPage.workspaceId, testPage.pageId);

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.evaluate((element, src) => {
      const tiptapEditor = (
        element as HTMLDivElement & { editor?: { commands: { setImage: (attrs: { src: string }) => boolean } } }
      ).editor;
      if (!tiptapEditor) {
        throw new Error("Editor instance missing on workspace page");
      }
      tiptapEditor.commands.setImage({ src: src as string });
    }, imageUrl);

    await expect(page.locator(".tiptap-image")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    const share = await createShareLink(page, accessToken, testPage.pageId, "view");

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const uploadRequests: string[] = [];

    anonPage.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/uploads/")) {
        uploadRequests.push(request.url());
      }
    });

    await anonPage.goto(`/s/${share.token}`);
    await expect(anonPage.locator(".tiptap-image")).toHaveCount(1, { timeout: 30_000 });
    await expect.poll(() => uploadRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);

    const badRequests = uploadRequests.filter(
      (requestUrl) => new URL(requestUrl).searchParams.get("share") !== share.token,
    );
    expect(badRequests).toEqual([]);

    await anonContext.close();
  });
});
