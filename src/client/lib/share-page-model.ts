import type { ActivePageSnapshot, ActivePageState } from "@/client/lib/active-page-model";
import type { PageAncestor } from "@/shared/types";
import type { ShareRootPage } from "@/client/components/share/use-share-view";

export interface SharePagePresentation {
  activePageId: string;
  isRootActive: boolean;
  isPageLoading: boolean;
  isAncestorTrailLoading: boolean;
  page: ActivePageSnapshot | null;
  ancestors: PageAncestor[];
  displayTitle: string;
  displayIcon: string | null;
  displayCoverUrl: string | null;
  isViewOnly: boolean;
}

export function deriveSharePagePresentation(
  rootPage: ShareRootPage,
  activePageId: string,
  activePageState: ActivePageState,
): SharePagePresentation {
  const isRootActive = activePageId === rootPage.id;
  const readyState =
    activePageState.kind === "ready" && activePageState.snapshot.id === activePageId ? activePageState : null;

  return {
    activePageId,
    isRootActive,
    isPageLoading: !readyState && activePageState.kind !== "unavailable",
    isAncestorTrailLoading: readyState?.ancestorsStatus === "loading",
    page: readyState?.snapshot ?? null,
    ancestors: readyState?.ancestors ?? [],
    displayTitle: readyState?.snapshot.title ?? (isRootActive ? rootPage.title : ""),
    displayIcon: readyState?.snapshot.icon ?? (isRootActive ? rootPage.icon : null),
    displayCoverUrl: readyState?.snapshot.coverUrl ?? (isRootActive ? rootPage.cover_url : null),
    isViewOnly: readyState ? readyState.access.mode === "view" : rootPage.permission === "view",
  };
}
