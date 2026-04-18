import { describe, expect, it } from "vitest";
import { deriveSharePagePresentation } from "@/client/lib/share-page-model";
import type { ActivePageState } from "@/client/lib/active-page-model";
import type { ShareRootPage } from "@/client/components/share/use-share-view";

const ROOT_PAGE: ShareRootPage = {
  id: "page-root",
  title: "Root",
  icon: "📄",
  cover_url: "/uploads/root-cover",
  permission: "view",
};

describe("deriveSharePagePresentation", () => {
  it("uses the ready page when the active page is loaded", () => {
    const state: ActivePageState = {
      kind: "ready",
      backing: "live",
      snapshot: { id: "page-child", workspaceId: "ws-1", title: "Child", icon: "🌿", coverUrl: null },
      access: { mode: "edit", confidence: "authoritative" },
      ancestors: [],
      ancestorsStatus: "ready",
    };

    expect(deriveSharePagePresentation(ROOT_PAGE, "page-child", state)).toMatchObject({
      activePageId: "page-child",
      isRootActive: false,
      isPageLoading: false,
      isAncestorTrailLoading: false,
      displayTitle: "Child",
      displayIcon: "🌿",
      isViewOnly: false,
    });
  });

  it("falls back to the root seed while the root page is still loading", () => {
    const state: ActivePageState = { kind: "loading" };

    expect(deriveSharePagePresentation(ROOT_PAGE, "page-root", state)).toMatchObject({
      activePageId: "page-root",
      isRootActive: true,
      isPageLoading: true,
      isAncestorTrailLoading: false,
      displayTitle: "Root",
      displayIcon: "📄",
      displayCoverUrl: "/uploads/root-cover",
      isViewOnly: true,
    });
  });

  it("does not leak stale ready data from a previous page id", () => {
    const state: ActivePageState = {
      kind: "ready",
      backing: "live",
      snapshot: { id: "page-old", workspaceId: "ws-1", title: "Old", icon: null, coverUrl: null },
      access: { mode: "view", confidence: "authoritative" },
      ancestors: [],
      ancestorsStatus: "ready",
    };

    expect(deriveSharePagePresentation(ROOT_PAGE, "page-next", state)).toMatchObject({
      activePageId: "page-next",
      isRootActive: false,
      isPageLoading: true,
      isAncestorTrailLoading: false,
      page: null,
      displayTitle: "",
      displayIcon: null,
      isViewOnly: true,
    });
  });

  it("surfaces ancestor trail loading separately from page readiness", () => {
    const state: ActivePageState = {
      kind: "ready",
      backing: "live",
      snapshot: { id: "page-child", workspaceId: "ws-1", title: "Child", icon: null, coverUrl: null },
      access: { mode: "view", confidence: "authoritative" },
      ancestors: [],
      ancestorsStatus: "loading",
    };

    expect(deriveSharePagePresentation(ROOT_PAGE, "page-child", state)).toMatchObject({
      activePageId: "page-child",
      isPageLoading: false,
      isAncestorTrailLoading: true,
      page: { id: "page-child" },
    });
  });
});
