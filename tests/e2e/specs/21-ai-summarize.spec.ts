import { test, expect, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("AI summarize + ask page (mock backend)", () => {
  test.slow();
  test("summarize button fetches a mock summary and ask streams an answer", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "AI Summarize Target");
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();

    await page.keyboard.type("Launch freeze begins Thursday. Rollout is staged by region.");
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    // Poll the snapshot endpoint until DocSync has persisted a non-empty snapshot to DO storage —
    // that is the same path /summarize reads from, so once this returns 200 with bytes we know
    // getIndexPayload will find real body text.
    await expect
      .poll(
        async () => {
          const res = await page.request.get(
            `/api/v1/workspaces/${testPage.workspaceId}/pages/${testPage.pageId}/snapshot`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (res.status() !== 200) return 0;
          return (await res.body()).byteLength;
        },
        { timeout: 30_000, intervals: [500, 1000, 1500, 2000] },
      )
      .toBeGreaterThan(0);

    const summarizeResponsePromise = page.waitForResponse((res) =>
      res.url().includes(`/workspaces/${testPage.workspaceId}/pages/${testPage.pageId}/summarize`),
    );

    const summarizeButton = page.locator('button[aria-label="Summarize page"]');
    await summarizeButton.waitFor({ timeout: 10_000 });
    await summarizeButton.click();

    const summarizeResponse = await summarizeResponsePromise;
    const summarizeBody = await summarizeResponse.text();
    if (summarizeResponse.status() !== 200) {
      throw new Error(`summarize failed: ${summarizeResponse.status()} ${summarizeBody}`);
    }

    const summary = page.locator('[data-testid="summarize-sheet-summary"]');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary).toContainText("[mock-summary]");

    const input = page.locator('[data-testid="summarize-sheet-input"]');
    await input.fill("What day does the freeze start?");
    await page.locator('[data-testid="summarize-sheet-send"]').click();

    const answer = page.locator('[data-testid="summarize-sheet-answer"]').last();
    await expect(answer).toContainText("[mock-chat]", { timeout: 15_000 });
  });
});
