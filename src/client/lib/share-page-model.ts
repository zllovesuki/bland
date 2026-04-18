import type { PageSurfaceState } from "@/client/lib/page-surface-model";
import type { AncestorInfo, Page } from "@/shared/types";
import type { ShareRootPage } from "@/client/components/share/use-share-view";

export interface SharePagePresentation {
  activePageId: string;
  isRootActive: boolean;
  isPageLoading: boolean;
  isAncestorTrailLoading: boolean;
  page: (Page & { can_edit?: boolean }) | null;
  ancestors: AncestorInfo[];
  displayTitle: string;
  displayIcon: string | null;
  displayCoverUrl: string | null;
  isViewOnly: boolean;
}

export function deriveSharePagePresentation(
  rootPage: ShareRootPage,
  activePageId: string,
  surfaceState: PageSurfaceState,
): SharePagePresentation {
  const isRootActive = activePageId === rootPage.id;
  const readyState = surfaceState.kind === "ready" && surfaceState.page.id === activePageId ? surfaceState : null;

  return {
    activePageId,
    isRootActive,
    isPageLoading: !readyState && surfaceState.kind !== "unavailable",
    isAncestorTrailLoading: readyState?.ancestorsStatus === "loading",
    page: readyState?.page ?? null,
    ancestors: readyState?.ancestors ?? [],
    displayTitle: readyState?.page.title ?? (isRootActive ? rootPage.title : ""),
    displayIcon: readyState?.page.icon ?? (isRootActive ? rootPage.icon : null),
    displayCoverUrl: readyState?.page.cover_url ?? (isRootActive ? rootPage.cover_url : null),
    isViewOnly: readyState ? readyState.page.can_edit === false : rootPage.permission === "view",
  };
}
