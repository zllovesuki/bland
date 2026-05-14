import { createContext, use } from "react";

export interface WorkspaceLayoutModeValue {
  expanded: boolean;
}

export const WorkspaceLayoutModeContext = createContext<WorkspaceLayoutModeValue | null>(null);

export function useWorkspaceLayoutMode(): WorkspaceLayoutModeValue {
  const value = use(WorkspaceLayoutModeContext);
  if (!value) {
    throw new Error("useWorkspaceLayoutMode must be used inside WorkspaceLayoutModeProvider");
  }
  return value;
}
