import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";
import type { Page, ResolvedViewerContext } from "@/shared/types";

interface CanonicalPageMentionViewerInput {
  accessMode: WorkspaceAccessMode | null;
  workspaceSlug: string | null;
  fallbackWorkspaceSlug: string;
  cachedPage: Page | null;
}

export function getCanonicalPageMentionViewer(input: CanonicalPageMentionViewerInput): ResolvedViewerContext | null {
  if (!input.accessMode && !input.cachedPage) return null;

  return {
    access_mode: input.accessMode ?? "member",
    principal_type: "user",
    route_kind: "canonical",
    workspace_slug: input.workspaceSlug ?? input.fallbackWorkspaceSlug,
  };
}

export function lookupCanonicalCachedMentionPage(
  pageMetaById: Record<string, Page>,
  workspaceId: string,
  pageId: string,
): { title: string; icon: string | null } | null {
  const page = pageMetaById[pageId];
  if (!page || page.workspace_id !== workspaceId || page.archived_at) return null;
  return { title: page.title, icon: page.icon };
}
