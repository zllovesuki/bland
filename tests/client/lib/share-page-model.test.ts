import { describe, expect, it } from "vitest";
import { deriveSharePagePresentation } from "@/client/lib/share-page-model";
import type { ActivePageState } from "@/client/lib/active-page-model";
import type { ShareRootPage } from "@/client/components/share/use-share-view";

const ROOT_PAGE: ShareRootPage = {
  id: "page-root",
  kind: "doc",
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
      snapshot: { id: "page-child", workspaceId: "ws-1", kind: "doc", title: "Child", icon: "🌿", coverUrl: null },
      access: { mode: "edit" },
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

  it("does not synthesize root metadata when the active page state is still loading", () => {
    // Boundary remount + useState(initialSnapshot) makes this transient state
    // unreachable for the root page in practice, but the derivation must not
    // paper over loading with stale rootPage fallbacks — display stays empty.
    const state: ActivePageState = { kind: "loading" };

    expect(deriveSharePagePresentation(ROOT_PAGE, "page-root", state)).toMatchObject({
      activePageId: "page-root",
      isRootActive: true,
      isPageLoading: true,
      isAncestorTrailLoading: false,
      displayTitle: "",
      displayIcon: null,
      displayCoverUrl: null,
      isViewOnly: true,
    });
  });

  it("does not leak stale ready data from a previous page id", () => {
    const state: ActivePageState = {
      kind: "ready",
      backing: "live",
      snapshot: { id: "page-old", workspaceId: "ws-1", kind: "doc", title: "Old", icon: null, coverUrl: null },
      access: { mode: "view" },
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
      snapshot: { id: "page-child", workspaceId: "ws-1", kind: "doc", title: "Child", icon: null, coverUrl: null },
      access: { mode: "view" },
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
