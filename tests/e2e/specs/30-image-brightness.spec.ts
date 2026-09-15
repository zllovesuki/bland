import * as Y from "yjs";
import {
  test,
  expect,
  createTestPage,
  createTestWorkspace,
  createShareLink,
  waitForDocEditorReady,
} from "../fixtures/bland-test";

test("image brightness supports keyboard input, reset, persistence, sharing, and publishing", async ({
  authenticatedPage: { page, accessToken },
  e2eContext,
  browser,
}) => {
  test.setTimeout(120_000);
  const workspace = await createTestWorkspace(page, accessToken, "Image Brightness");
  const testPage = await createTestPage(page, accessToken, "Image Brightness", workspace);
  await page.goto(`/${testPage.workspaceSlug}/${testPage.pageId}`);
  const editor = await waitForDocEditorReady(page, { editable: true, connected: true });
  await editor.click();
  await editor.evaluate(async (element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4f2eb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#243129";
    context.font = "32px sans-serif";
    context.fillText("Image brightness", 40, 80);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("PNG fixture failed"))), "image/png");
    });
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([blob], "first.png", { type: "image/png" }));
    clipboard.items.add(new File([blob], "second.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });

  const images = editor.locator("img.tiptap-image");
  await expect(images).toHaveCount(2);
  await expect(images.first()).toBeVisible();
  await expect(images.last()).toBeVisible();
  const originalSrc = await images.first().getAttribute("src");
  await images.first().click();
  const slider = page.getByRole("slider", { name: "Image brightness" });
  await expect(slider).toHaveValue("100");
  await slider.focus();
  await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("99");
  await expect(slider).toBeFocused();
  await expect(images.first()).toHaveCSS("filter", "brightness(0.99)");

  const reset = page.getByRole("button", { name: "Reset brightness" });
  await reset.focus();
  await reset.press("Enter");
  await expect(slider).toHaveValue("100");
  await expect(images.first()).toHaveCSS("filter", "none");

  await page.setViewportSize({ width: 390, height: 844 });
  await images.first().scrollIntoViewIfNeeded();
  await images.first().click();
  await slider.focus();
  for (let step = 0; step < 25; step++) await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("75");
  await expect(images.first()).toHaveCSS("filter", "brightness(0.75)");
  await expect(images.last()).toHaveCSS("filter", "none");
  await expect(images.first()).toHaveAttribute("src", originalSrc!);
  const bounds = await page.locator(".tiptap-image-toolbar").boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: test.info().outputPath("image-brightness-mobile.png") });

  const headers = { Authorization: `Bearer ${accessToken}` };
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/v1/workspaces/${workspace.workspaceId}/pages/${testPage.pageId}/snapshot`,
          { headers },
        );
        if (response.status() !== 200) return [];
        const document = new Y.Doc();
        try {
          Y.applyUpdate(document, new Uint8Array(await response.body()));
          return document
            .getXmlFragment("document-store")
            .toArray()
            .filter((node): node is Y.XmlElement => node instanceof Y.XmlElement && node.nodeName === "image")
            .map((node) => Number(node.getAttribute("brightness") ?? 100));
        } finally {
          document.destroy();
        }
      },
      { timeout: 15_000 },
    )
    .toEqual([75, 100]);

  await page.reload();
  await waitForDocEditorReady(page, { editable: true, connected: true });
  await expect(images.first()).toHaveCSS("filter", "brightness(0.75)");
  await expect(images.last()).toHaveCSS("filter", "none");

  const share = await createShareLink(page, accessToken, testPage.pageId, "view");
  const anonymous = await browser.newContext();
  try {
    const viewer = await anonymous.newPage();
    await viewer.goto(`${e2eContext.baseUrl}/s/${share.token}`);
    await waitForDocEditorReady(viewer, { editable: false });
    await expect(viewer.locator(".tiptap img.tiptap-image").first()).toHaveCSS("filter", "brightness(0.75)");
    await expect(viewer.getByRole("slider", { name: "Image brightness" })).toHaveCount(0);

    const slug = `brightness-${Date.now().toString(36)}`;
    const site = await page.request.patch(`/api/v1/workspaces/${workspace.workspaceId}/site`, {
      headers,
      data: { slug, published: true },
    });
    expect(site.ok()).toBe(true);
    const publish = await page.request.post(
      `/api/v1/workspaces/${workspace.workspaceId}/site/pages/${testPage.pageId}`,
      { headers },
    );
    expect(publish.ok()).toBe(true);
    // Allow the save projection to pass through the configured five-second queue batch.
    await page.waitForTimeout(6500);
    const { port } = new URL(e2eContext.baseUrl);
    const publicUrl = `http://${slug}.bland.localhost${port ? `:${port}` : ""}/image-brightness-${testPage.pageId.toLowerCase()}`;
    const response = await viewer.goto(publicUrl);
    expect(response?.status()).toBe(200);
    await expect(viewer.locator(".tiptap img.tiptap-image").first()).toHaveCSS("filter", "brightness(0.75)");
    await expect(viewer.locator(".tiptap img.tiptap-image").last()).toHaveCSS("filter", "none");
    await expect(viewer.getByRole("slider", { name: "Image brightness" })).toHaveCount(0);
  } finally {
    await anonymous.close();
  }
});
