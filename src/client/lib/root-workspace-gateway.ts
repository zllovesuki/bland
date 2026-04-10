import type { Workspace } from "@/shared/types";

export type RootWorkspaceDecision =
  | { kind: "redirect"; workspace: Workspace }
  | { kind: "empty" }
  | { kind: "unavailable" };

interface ResolveRootWorkspaceDecisionInput {
  currentWorkspace: Workspace | null;
  cachedWorkspaces: Workspace[];
  liveWorkspaces: Workspace[] | null;
}

function findCurrentWorkspaceMatch(workspaces: Workspace[], currentWorkspace: Workspace | null): Workspace | null {
  if (!currentWorkspace) return null;
  return workspaces.find((workspace) => workspace.id === currentWorkspace.id) ?? null;
}

export function resolveRootWorkspaceDecision({
  currentWorkspace,
  cachedWorkspaces,
  liveWorkspaces,
}: ResolveRootWorkspaceDecisionInput): RootWorkspaceDecision {
  if (liveWorkspaces !== null) {
    const liveTarget = findCurrentWorkspaceMatch(liveWorkspaces, currentWorkspace) ?? liveWorkspaces[0] ?? null;
    if (liveTarget) {
      return { kind: "redirect", workspace: liveTarget };
    }

    return { kind: "empty" };
  }

  const cachedTarget = findCurrentWorkspaceMatch(cachedWorkspaces, currentWorkspace);
  if (cachedTarget) {
    return { kind: "redirect", workspace: cachedTarget };
  }

  return { kind: "unavailable" };
}
