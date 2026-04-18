import { createContext, useContext } from "react";
import { useActivePageState } from "@/client/components/active-page/use-active-page";
import { deriveSharePagePresentation } from "@/client/lib/share-page-model";
import type { ResolvedViewerContext, SharePermission } from "@/shared/types";

export type ShareViewStatus = "loading" | "ready" | "error";

export interface ShareRootPage {
  id: string;
  title: string;
  icon: string | null;
  cover_url: string | null;
  permission: SharePermission;
}

interface ShareViewBaseState {
  token: string;
}

export interface ShareViewLoadingState extends ShareViewBaseState {
  status: "loading";
  error: null;
}

export interface ShareViewErrorState extends ShareViewBaseState {
  status: "error";
  error: string;
}

export interface ShareViewReadyState extends ShareViewBaseState {
  status: "ready";
  error: null;
  workspaceId: string;
  viewer: ResolvedViewerContext;
  rootPageId: string;
  rootPage: ShareRootPage;
  activePageId: string;
  navigate: (pageId: string) => void;
  patchRootPage: (updates: Partial<ShareRootPage>) => void;
}

export type ShareViewState = ShareViewLoadingState | ShareViewErrorState | ShareViewReadyState;

export const ShareViewContext = createContext<ShareViewState | null>(null);

export function useShareView(): ShareViewState {
  const ctx = useContext(ShareViewContext);
  if (!ctx) throw new Error("useShareView must be used inside ShareViewProvider");
  return ctx;
}

export function useReadyShareView(): ShareViewReadyState {
  const view = useShareView();
  if (view.status !== "ready") {
    throw new Error("useReadyShareView must be used in the ready share branch");
  }
  return view;
}

export function useSharedPagePresentation() {
  const share = useReadyShareView();
  const activePageState = useActivePageState();
  const presentation = deriveSharePagePresentation(share.rootPage, share.activePageId, activePageState);
  const isRootActive = presentation.isRootActive;

  return {
    ...presentation,
    ancestors: isRootActive ? [] : presentation.ancestors,
    isAncestorTrailLoading: isRootActive ? false : presentation.isAncestorTrailLoading,
    rootPageId: share.rootPageId,
    rootPage: share.rootPage,
    workspaceId: share.workspaceId,
    token: share.token,
    navigate: share.navigate,
    patchRootPage: share.patchRootPage,
    unavailableMessage: activePageState.kind === "unavailable" ? activePageState.message : null,
  };
}
