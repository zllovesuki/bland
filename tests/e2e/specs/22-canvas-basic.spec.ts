import { test, expect, createTestPage } from "../fixtures/bland-test";

test.describe("canvas page - basic", () => {
  test("sidebar dropdown creates a canvas page and Excalidraw mounts", async ({ authenticatedPage: { page } }) => {
    await page.goto("/");

    const newPageChevron = page.getByRole("button", { name: "New page options" });
    await newPageChevron.waitFor({ timeout: 15_000 });
    await newPageChevron.click();

    const newCanvasOption = page.getByRole("button", { name: "New canvas" });
    await newCanvasOption.waitFor({ timeout: 5_000 });
    await newCanvasOption.click();

    // Excalidraw's root container has a predictable class; wait for it to mount.
    await page.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });

    // URL should match /$workspaceSlug/$pageId
    await expect(page).toHaveURL(/\/[^/]+\/[A-Z0-9]+$/);

    // No Tiptap editor should render on a canvas page.
    await expect(page.locator(".tiptap[contenteditable='true']")).toHaveCount(0);
  });

  test("API-created canvas page mounts Excalidraw (not the editor)", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const testPage = await createTestPage(page, accessToken, "Canvas via API", undefined, "canvas");

    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);

    await page.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });
    await expect(page.locator(".tiptap[contenteditable='true']")).toHaveCount(0);
    await expect(page.locator("aside[aria-label='Document outline']")).toHaveCount(0);
  });

  test("canvas page persists drawn elements across reload", async ({ authenticatedPage: { page, accessToken } }) => {
    const testPage = await createTestPage(page, accessToken, "Canvas Persistence", undefined, "canvas");

    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);
    await page.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });

    // Select the rectangle tool (Excalidraw exposes shortcut `R`) and drag-draw.
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

    // Let the debounced Y write + IDB persistence flush.
    await page.waitForTimeout(1_500);

    // Reload; the rectangle should still be present in the scene.
    await page.reload();
    await page.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const fn = (window as unknown as { __E2E_CANVAS_SCENE_COUNT__?: () => number }).__E2E_CANVAS_SCENE_COUNT__;
            return typeof fn === "function" ? fn() : null;
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);
  });
});
