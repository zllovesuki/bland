import { createContext, useContext } from "react";
import type YProvider from "y-partyserver/provider";
import type { PageSurfaceState } from "@/client/lib/page-surface-model";
import type { PageCapabilities } from "@/client/lib/page-capabilities";
import type { PageLoadTarget } from "@/client/lib/page-load-target";
import type { Page } from "@/shared/types";

export type { PageLoadTarget };

export interface PageSurfaceContextValue {
  state: PageSurfaceState;
  wsProvider: YProvider | null;
  setWsProvider: (p: YProvider | null) => void;
  patchPage: (updates: Partial<Page & { can_edit?: boolean }>) => void;
  capabilities: PageCapabilities;
}

export const PageSurfaceCtx = createContext<PageSurfaceContextValue | null>(null);

export function usePageSurface(): PageSurfaceContextValue {
  const ctx = useContext(PageSurfaceCtx);
  if (!ctx) throw new Error("usePageSurface must be used inside PageSurfaceProvider");
  return ctx;
}

export function usePageCapabilities(): PageCapabilities {
  return usePageSurface().capabilities;
}
