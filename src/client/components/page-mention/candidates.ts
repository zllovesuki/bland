import { selectActiveWorkspacePages, useWorkspaceReplicaStore } from "@/client/stores/workspace-replica";
import type { PageMentionCandidate } from "./types";

export function getInsertablePageMentionCandidates(
  workspaceId: string | undefined,
  excludePageId: string | undefined,
): PageMentionCandidate[] {
  if (!workspaceId) return [];
  const pages = selectActiveWorkspacePages(useWorkspaceReplicaStore.getState(), workspaceId);
  const candidates: PageMentionCandidate[] = [];
  for (const page of pages) {
    if (page.id === excludePageId) continue;
    candidates.push({
      pageId: page.id,
      title: page.title || "Untitled",
      icon: page.icon,
    });
  }
  return candidates;
}
