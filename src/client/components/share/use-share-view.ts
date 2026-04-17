import { createContext, useContext } from "react";
import type YProvider from "y-partyserver/provider";
import type { SharedPageInfo } from "@/shared/types";

export type ShareViewStatus = "loading" | "ready" | "error";

export interface ShareViewState {
  status: ShareViewStatus;
  info: SharedPageInfo | null;
  error: string | null;
  displayPageId: string | null;
  wsProvider: YProvider | null;
  setWsProvider: (p: YProvider | null) => void;
  handleNavigate: (pageId: string) => void;
  handleTitleChange: (titleOverride: string) => void;
}

export const ShareViewContext = createContext<ShareViewState | null>(null);

export function useShareView(): ShareViewState {
  const ctx = useContext(ShareViewContext);
  if (!ctx) throw new Error("useShareView must be used inside ShareViewProvider");
  return ctx;
}
