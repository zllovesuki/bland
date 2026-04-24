import { test, expect, createTestWorkspace, createTestPage } from "../fixtures/bland-test";
import type { Page as PlaywrightPage } from "@playwright/test";

async function createGuestInvite(
  page: PlaywrightPage,
  accessToken: string,
  workspaceId: string,
): Promise<{ token: string }> {
  const res = await page.request.post(`/api/v1/workspaces/${workspaceId}/invite`, {
    data: { role: "guest" },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) throw new Error(`Failed to create invite: ${res.status()}`);
  const data = (await res.json()) as { invite: { token: string } };
  return { token: data.invite.token };
}

async function shareWithUserByEmail(
  page: PlaywrightPage,
  accessToken: string,
  pageId: string,
  granteeEmail: string,
  permission: "view" | "edit",
): Promise<void> {
  const res = await page.request.post(`/api/v1/pages/${pageId}/share`, {
    data: { grantee_type: "user", grantee_email: granteeEmail, permission },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) throw new Error(`Failed to share with user: ${res.status()} ${await res.text()}`);
}

async function acceptInviteAsNewUser(
  page: PlaywrightPage,
  token: string,
  email: string,
  password: string,
  name: string,
): Promise<{ accessToken: string }> {
  const res = await page.request.post(`/api/v1/invite/${token}/accept`, {
    data: { turnstileToken: "test", email, password, name },
  });
  if (!res.ok()) throw new Error(`Failed to accept invite: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { accessToken: string };
  return { accessToken: body.accessToken };
}

async function loginAs(page: PlaywrightPage, email: string, password: string): Promise<{ accessToken: string }> {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password, turnstileToken: "test" },
  });
  if (!res.ok()) throw new Error(`Login failed: ${res.status()}`);
  return (await res.json()) as { accessToken: string };
}

test.describe("guest workspace shell", () => {
  test("guest with zero visible pages sees the restricted empty state, not the create CTA", async ({
    authenticatedPage: { page: ownerPage, accessToken: ownerToken },
    browser,
  }) => {
    const ownerWorkspace = await createTestWorkspace(ownerPage, ownerToken, "Empty Guest Workspace");
    const invite = await createGuestInvite(ownerPage, ownerToken, ownerWorkspace.workspaceId);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const guestEmail = `e2e-guest-empty-${suffix}@example.com`;
    const guestPassword = "password1234";
    const guestName = `Guest Empty ${suffix}`;

    await acceptInviteAsNewUser(guestPage, invite.token, guestEmail, guestPassword, guestName);
    await loginAs(guestPage, guestEmail, guestPassword);

    await guestPage.goto(`/${ownerWorkspace.workspaceSlug}`);
    await expect(guestPage.getByText("Nothing here yet.")).toBeVisible({ timeout: 15_000 });
    await expect(guestPage.getByRole("button", { name: /create first page/i })).toHaveCount(0);

    await guestContext.close();
  });

  test("guest lands in the workspace shell without create CTA, AI affordances, or redirect loop", async ({
    authenticatedPage: { page: ownerPage, accessToken: ownerToken },
    browser,
  }) => {
    const ownerWorkspace = await createTestWorkspace(ownerPage, ownerToken, "Guest Host Workspace");
    const sharedPage = await createTestPage(ownerPage, ownerToken, "Shared With Guest", ownerWorkspace);

    const invite = await createGuestInvite(ownerPage, ownerToken, ownerWorkspace.workspaceId);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const guestEmail = `e2e-guest-${suffix}@example.com`;
    const guestPassword = "password1234";
    const guestName = `Guest ${suffix}`;

    await acceptInviteAsNewUser(guestPage, invite.token, guestEmail, guestPassword, guestName);
    // Grant the guest view access to the canonical page so the page actually
    // loads for them. Without this share grant, a guest hits 404 and the
    // "Summarize/Ask absent" assertion trivially passes on the error state.
    await shareWithUserByEmail(ownerPage, ownerToken, sharedPage.pageId, guestEmail, "view");

    const pageErrors: string[] = [];
    guestPage.on("pageerror", (err) => pageErrors.push(err.message));

    await loginAs(guestPage, guestEmail, guestPassword);

    // The guest must land in the workspace shell (not /), and the shell must
    // never surface the "Create first page" CTA — guests cannot create pages.
    // With a shared page in their visible tree, the workspace index renders
    // the populated state ("Pick a page...") instead of the empty state.
    await guestPage.goto(`/${ownerWorkspace.workspaceSlug}`);

    await expect(guestPage).toHaveURL(new RegExp(`/${ownerWorkspace.workspaceSlug}(/|$)`));
    await expect(guestPage.getByRole("button", { name: /create first page/i })).toHaveCount(0);
    await expect(guestPage.getByRole("button", { name: /^\+ Page$|New page|Add page/i })).toHaveCount(0);

    // Default shell shows the Settings link so the guest can reach Leave
    // Workspace. The Invite section inside settings is writer-only.
    const settingsLink = guestPage.getByLabel("Settings", { exact: true });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();
    await guestPage.waitForURL(`**/${ownerWorkspace.workspaceSlug}/settings`, { timeout: 10_000 });
    await expect(guestPage.getByRole("heading", { name: "Workspace Settings" })).toBeVisible();
    await expect(guestPage.getByRole("heading", { name: "Leave workspace" })).toBeVisible();
    await expect(guestPage.getByRole("heading", { name: /^Invite$/ })).toHaveCount(0);

    // Navigate to the shared canonical page. The guest has page-share access
    // (via the membership + page_shares walk in permissions.ts), but the AI
    // editor toolbar is role-gated: guests do not see rewrite/generate/ask.
    await guestPage.goto(`/${ownerWorkspace.workspaceSlug}/${sharedPage.pageId}`);
    // The page must actually render — the editor (tiptap) and title input
    // both become visible once the page is loaded. This confirms the guest
    // reached the page rather than an error state.
    await expect(guestPage.locator("main .tiptap")).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.locator("main textarea[placeholder='Untitled']")).toHaveValue("Shared With Guest", {
      timeout: 10_000,
    });

    // Toolbar affordance check: AI buttons are not rendered for guests.
    await expect(guestPage.getByRole("button", { name: /Summarize/i })).toHaveCount(0);
    await expect(guestPage.getByRole("button", { name: /Ask/i })).toHaveCount(0);

    // Navigate back to /$wsSlug and confirm the shell does not re-bounce the
    // guest through the root gateway (loop guard from bug1 §1a + bug2 §3).
    await guestPage.goto(`/${ownerWorkspace.workspaceSlug}`);
    await expect(guestPage).toHaveURL(new RegExp(`/${ownerWorkspace.workspaceSlug}(/|$)`));

    expect(pageErrors).toEqual([]);

    await guestContext.close();
  });

  test("guest can leave the workspace and is routed back to /", async ({
    authenticatedPage: { page: ownerPage, accessToken: ownerToken },
    browser,
  }) => {
    const ownerWorkspace = await createTestWorkspace(ownerPage, ownerToken, "Guest Exit Workspace");
    const invite = await createGuestInvite(ownerPage, ownerToken, ownerWorkspace.workspaceId);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const guestEmail = `e2e-guest-exit-${suffix}@example.com`;
    const guestPassword = "password1234";
    const guestName = `Guest Exit ${suffix}`;

    await acceptInviteAsNewUser(guestPage, invite.token, guestEmail, guestPassword, guestName);
    await loginAs(guestPage, guestEmail, guestPassword);

    await guestPage.goto(`/${ownerWorkspace.workspaceSlug}/settings`);
    await expect(guestPage.getByRole("heading", { name: "Leave workspace" })).toBeVisible({ timeout: 10_000 });

    guestPage.once("dialog", (dialog) => dialog.accept());
    await guestPage.getByRole("button", { name: /Leave workspace/ }).click();

    // Confirm dialog is the custom `confirm()` component. Click the Leave
    // button inside that dialog when it appears.
    const confirmLeave = guestPage.getByRole("button", { name: /^Leave$/ });
    if (await confirmLeave.isVisible().catch(() => false)) {
      await confirmLeave.click();
    }

    // On success we route to /. Because the test user in TEST_CREDENTIALS owns
    // the seed workspace, root routing may either land on "/" (no workspaces)
    // or redirect into the seed workspace for the authenticated fixture user —
    // but the guest user we just created has no workspaces of their own, so
    // the root view resolves to the empty-workspace or shared-inbox surface.
    await guestPage.waitForURL((url) => !url.pathname.startsWith(`/${ownerWorkspace.workspaceSlug}`), {
      timeout: 10_000,
    });

    // Membership is gone; hitting the workspace shell now redirects.
    await guestPage.goto(`/${ownerWorkspace.workspaceSlug}`);
    await expect
      .poll(() => new URL(guestPage.url()).pathname, { timeout: 10_000 })
      .not.toBe(`/${ownerWorkspace.workspaceSlug}`);

    await guestContext.close();
  });
});
