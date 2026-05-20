import { test, expect, createTestPage, waitForPersistedSnapshot } from "../fixtures/bland-test";

test.describe("AI summarize + ask page (mock backend)", () => {
  test.slow();
  test("summarize button fetches a mock summary and ask streams an answer", async ({
    authenticatedPage: { page, accessToken },
    e2eWorkspace,
  }) => {
    const testPage = await createTestPage(page, accessToken, "AI Summarize Target", e2eWorkspace);
    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    const editor = page.locator(".tiptap[contenteditable='true']");
    await editor.waitFor({ timeout: 30_000 });
    await editor.click();

    await page.keyboard.type("Launch freeze begins Thursday. Rollout is staged by region.");
    await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });

    await waitForPersistedSnapshot(page, accessToken, {
      ...testPage,
      expectedText: "Launch freeze begins Thursday. Rollout is staged by region.",
    });

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
