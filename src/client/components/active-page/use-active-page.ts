import { createContext, useContext } from "react";
import type YProvider from "y-partyserver/provider";
import type { ActivePagePatch, ActivePageState } from "@/client/lib/active-page-model";
import type { PageLoadTarget } from "@/client/lib/page-load-target";

export type { PageLoadTarget };

export interface ActivePageSyncValue {
  syncProvider: YProvider | null;
  setSyncProvider: (provider: YProvider | null) => void;
}

export interface ActivePageActionsValue {
  patchPage: (updates: ActivePagePatch) => void;
}

const ActivePageStateCtx = createContext<ActivePageState | null>(null);
const ActivePageSyncCtx = createContext<ActivePageSyncValue | null>(null);
const ActivePageActionsCtx = createContext<ActivePageActionsValue | null>(null);

export function useActivePageState(): ActivePageState {
  const ctx = useContext(ActivePageStateCtx);
  if (!ctx) throw new Error("useActivePageState must be used inside ActivePageProvider");
  return ctx;
}

export function useActivePageSync(): ActivePageSyncValue {
  const ctx = useContext(ActivePageSyncCtx);
  if (!ctx) throw new Error("useActivePageSync must be used inside ActivePageProvider");
  return ctx;
}

export function useActivePageActions(): ActivePageActionsValue {
  const ctx = useContext(ActivePageActionsCtx);
  if (!ctx) throw new Error("useActivePageActions must be used inside ActivePageProvider");
  return ctx;
}

export const ActivePageContexts = {
  State: ActivePageStateCtx,
  Sync: ActivePageSyncCtx,
  Actions: ActivePageActionsCtx,
};
