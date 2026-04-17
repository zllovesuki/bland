import { createContext, useContext } from "react";
import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";
import type { PageLoadTarget } from "@/client/lib/page-load-target";
import type { Page, Workspace, WorkspaceMember } from "@/shared/types";

export type { PageLoadTarget };

export interface CanonicalPageContextValue {
  workspaceId: string | null;
  cachedPage: Page | null;
  workspace: Workspace | null;
  pages: Page[];
  members: WorkspaceMember[];
  accessMode: WorkspaceAccessMode | null;
  pageLoadTarget: PageLoadTarget | null;
}

export const CanonicalPageContext = createContext<CanonicalPageContextValue | null>(null);

export function useCanonicalPageContext(): CanonicalPageContextValue {
  const value = useContext(CanonicalPageContext);
  if (!value) throw new Error("useCanonicalPageContext must be used inside CanonicalPageContext.Provider");
  return value;
}
