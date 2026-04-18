import { describe, expect, it } from "vitest";
import { deriveSharePagePresentation } from "@/client/lib/share-page-model";
import { createPage } from "@tests/client/util/fixtures";
import type { PageSurfaceState } from "@/client/lib/page-surface-model";
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
    const state: PageSurfaceState = {
      kind: "ready",
      source: "live",
      page: { ...createPage({ id: "page-child", title: "Child", icon: "🌿" }), can_edit: true },
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
    const state: PageSurfaceState = { kind: "loading" };

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
    const state: PageSurfaceState = {
      kind: "ready",
      source: "live",
      page: { ...createPage({ id: "page-old", title: "Old" }), can_edit: false },
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
    const state: PageSurfaceState = {
      kind: "ready",
      source: "live",
      page: { ...createPage({ id: "page-child", title: "Child" }), can_edit: false },
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
