import { test, expect, createTestPage } from "../fixtures/bland-test";
import { TEST_CREDENTIALS } from "../harness";

test.describe("rapid page navigation - authenticated", () => {
  test("switching pages A -> B -> C quickly settles on C without freezing", async ({
    authenticatedPage: { page, accessToken },
  }) => {
    // Track page errors (hard freeze / unrecoverable)
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Create three pages via API
    const [pageA, , pageC] = await Promise.all([
      createTestPage(page, accessToken, "Page Alpha"),
      createTestPage(page, accessToken, "Page Beta"),
      createTestPage(page, accessToken, "Page Gamma"),
    ]);

    // Navigate to page A first
    await page.goto(`/${TEST_CREDENTIALS.workspaceSlug}/${pageA.pageId}`);
    const editor = page.locator(".tiptap");
    await editor.waitFor({ timeout: 30_000 });

    // Rapid-click through sidebar: A -> B -> C
    const sidebarLinkB = page.locator("aside nav a, aside nav button, nav a").filter({ hasText: "Page Beta" }).first();
    const sidebarLinkC = page.locator("aside nav a, aside nav button, nav a").filter({ hasText: "Page Gamma" }).first();

    // Wait for sidebar to render page links
    await sidebarLinkB.waitFor({ timeout: 15_000 });

    // Click B then immediately click C (rapid switch)
    await sidebarLinkB.click();
    await page.waitForTimeout(100);
    await sidebarLinkC.click();

    // Wait for the final page to settle
    await page.waitForURL(`**/${pageC.pageId}`, { timeout: 15_000 });

    // Wait for editor to mount on the final page
    await editor.waitFor({ timeout: 30_000 });

    // Verify the page is interactive: click and type
    await editor.click();
    await page.keyboard.type("test input");
    await expect(editor).toContainText("test input");

    // No page errors should have occurred
    expect(pageErrors).toEqual([]);
  });
});
