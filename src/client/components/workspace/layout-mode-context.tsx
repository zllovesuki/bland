import { createContext, use } from "react";

interface WorkspaceLayoutModeValue {
  expanded: boolean;
}

const WorkspaceLayoutModeContext = createContext<WorkspaceLayoutModeValue | null>(null);

export function WorkspaceLayoutModeProvider({
  expanded,
  children,
}: WorkspaceLayoutModeValue & { children: React.ReactNode }) {
  return <WorkspaceLayoutModeContext.Provider value={{ expanded }}>{children}</WorkspaceLayoutModeContext.Provider>;
}

export function useWorkspaceLayoutMode(): WorkspaceLayoutModeValue {
  const value = use(WorkspaceLayoutModeContext);
  if (!value) {
    throw new Error("useWorkspaceLayoutMode must be used inside WorkspaceLayoutModeProvider");
  }
  return value;
}
