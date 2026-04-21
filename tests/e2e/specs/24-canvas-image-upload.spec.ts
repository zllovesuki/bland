import { test, expect, createTestPage } from "../fixtures/bland-test";

// Smallest legal PNG (1x1) as base64 — enough to validate the upload
// round-trip without shipping a test asset.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

test.describe("canvas page - images", () => {
  test("dropping an image uploads + persists across reload via hydration", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    const testPage = await createTestPage(page, accessToken, "Canvas Image Upload", undefined, "canvas");

    await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);
    await page.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });

    // Drop a PNG onto the canvas. Excalidraw listens for drag-drop via
    // document-level listeners, so dispatching a `drop` on the excalidraw
    // root triggers its image-insertion flow.
    const excalidrawRoot = page.locator(".excalidraw").first();
    await excalidrawRoot.evaluate((root, base64) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes as BlobPart], "pixel.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const rect = root.getBoundingClientRect();
      root.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          dataTransfer: dt,
        }),
      );
    }, TINY_PNG_BASE64);

    // Wait for the element to appear in the scene. Drop-to-scene goes through
    // Excalidraw's own async readers, so give it a generous window.
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

    // Allow the upload + Yjs write + IDB flush to land.
    await page.waitForTimeout(2_500);

    await page.reload();
    await page.locator(".excalidraw").waitFor({ state: "attached", timeout: 30_000 });

    // On reload, the binding reads yFileRefs and hydrates via
    // fetchUploadAsDataURL → addFiles. The image element should re-appear
    // in the scene.
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
