import { test, expect, createTestPage, createShareLink } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("discriminated awareness", () => {
  test("share viewer never receives the member's real name over the wire", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const testPage = await createTestPage(page, accessToken, "Discriminated Awareness Test");
    const share = await createShareLink(page, accessToken, testPage.pageId, "view");

    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);
    const memberEditor = page.locator(".tiptap[contenteditable='true']");
    await memberEditor.waitFor({ timeout: 30_000 });
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    const anonContext = await browser.newContext();
    const shareViewer = await anonContext.newPage();

    const framePayloads: string[] = [];
    shareViewer.on("websocket", (ws) => {
      ws.on("framereceived", (event) => {
        const payload = event.payload;
        framePayloads.push(typeof payload === "string" ? payload : Buffer.from(payload).toString("utf8"));
      });
    });

    try {
      await shareViewer.goto(`/s/${share.token}`);
      const shareEditor = shareViewer.locator(".tiptap");
      await shareEditor.waitFor({ timeout: 30_000 });

      await memberEditor.click();
      await page.keyboard.type("Hello collaborators");
      await expect(shareEditor).toContainText("Hello collaborators", { timeout: 15_000 });

      // Give awareness a beat to propagate after the doc update settles.
      await shareViewer.waitForTimeout(1500);

      const combined = framePayloads.join("\n");
      expect(combined).not.toContain(TEST_CREDENTIALS.name);

      const labels = shareViewer.locator(".collaboration-carets__label");
      const count = await labels.count();
      for (let i = 0; i < count; i++) {
        const text = (await labels.nth(i).textContent()) ?? "";
        expect(text).not.toContain(TEST_CREDENTIALS.name);
      }
    } finally {
      await anonContext.close();
    }
  });
});
