import type { Workspace } from "@/shared/types";

type RootWorkspaceDecision = { kind: "redirect"; workspace: Workspace } | { kind: "empty" } | { kind: "unavailable" };

interface ResolveRootWorkspaceDecisionInput {
  lastVisitedWorkspaceId: string | null;
  cachedWorkspaces: Workspace[];
  liveWorkspaces: Workspace[] | null;
}

function findPreferredWorkspace(workspaces: Workspace[], lastVisitedId: string | null): Workspace | null {
  if (lastVisitedId) {
    const match = workspaces.find((w) => w.id === lastVisitedId);
    if (match) return match;
  }
  return workspaces[0] ?? null;
}

export function resolveRootWorkspaceDecision({
  lastVisitedWorkspaceId,
  cachedWorkspaces,
  liveWorkspaces,
}: ResolveRootWorkspaceDecisionInput): RootWorkspaceDecision {
  if (liveWorkspaces !== null) {
    const liveTarget = findPreferredWorkspace(liveWorkspaces, lastVisitedWorkspaceId);
    if (liveTarget) {
      return { kind: "redirect", workspace: liveTarget };
    }

    return { kind: "empty" };
  }

  const cachedTarget = findPreferredWorkspace(cachedWorkspaces, lastVisitedWorkspaceId);
  if (cachedTarget) {
    return { kind: "redirect", workspace: cachedTarget };
  }

  return { kind: "unavailable" };
}
