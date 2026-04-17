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

/**
 * Non-throwing variant for surfaces (e.g. share-link header / page-view) that
 * are mounted by a layout *before* the page-surface itself exists. Returns
 * `null` until the provider is in scope; consumers must treat null as
 * "no surface yet" and render a loading affordance.
 */
export function useOptionalPageSurface(): PageSurfaceContextValue | null {
  return useContext(PageSurfaceCtx);
}

export function usePageCapabilities(): PageCapabilities {
  return usePageSurface().capabilities;
}
