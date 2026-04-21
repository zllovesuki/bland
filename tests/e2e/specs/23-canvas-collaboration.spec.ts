import { test, expect, createTestPage, loginPage } from "../fixtures/bland-test";

test.describe("canvas page - collaboration", () => {
  test("two peers on the same canvas replicate drawn elements", async ({
    authenticatedPage: { page, accessToken },
    browser,
  }) => {
    const canvasPage = await createTestPage(page, accessToken, "Canvas Collab", undefined, "canvas");

    // Peer A — load the canvas and draw a rectangle.
    await page.goto(`/${canvasPage.workspaceSlug}/${canvasPage.pageId}`);
    await page.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });

    await page.locator(".excalidraw").click();
    await page.keyboard.press("r");

    const canvas = page.locator("canvas.excalidraw__canvas.interactive").first();
    await canvas.waitFor({ timeout: 10_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");

    const startX = box.x + box.width * 0.3;
    const startY = box.y + box.height * 0.3;
    const endX = box.x + box.width * 0.6;
    const endY = box.y + box.height * 0.6;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // Wait for first WS sync of the local element.
    await page.waitForTimeout(1_500);

    // Peer B — open the same canvas in a fresh context.
    const peerBContext = await browser.newContext();
    const peerB = await peerBContext.newPage();
    await loginPage(peerB);
    await peerB.goto(`/${canvasPage.workspaceSlug}/${canvasPage.pageId}`);
    await peerB.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });

    // Peer B's scene should converge to at least one element within 5s.
    await expect
      .poll(
        () =>
          peerB.evaluate(() => {
            const fn = (window as unknown as { __E2E_CANVAS_SCENE_COUNT__?: () => number }).__E2E_CANVAS_SCENE_COUNT__;
            return typeof fn === "function" ? fn() : null;
          }),
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(1);

    await peerBContext.close();
  });
});
