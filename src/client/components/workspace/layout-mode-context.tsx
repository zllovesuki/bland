import { WorkspaceLayoutModeContext, type WorkspaceLayoutModeValue } from "./layout-mode";

export function WorkspaceLayoutModeProvider({
  expanded,
  children,
}: WorkspaceLayoutModeValue & { children: React.ReactNode }) {
  return <WorkspaceLayoutModeContext.Provider value={{ expanded }}>{children}</WorkspaceLayoutModeContext.Provider>;
}
