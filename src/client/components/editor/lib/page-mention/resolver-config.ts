import type { ResolvedViewerContext } from "@/shared/types";
import type { WorkspaceRouteSource } from "@/client/lib/workspace-route-model";

export function canUseCachedPageMentionData(viewer: ResolvedViewerContext, routeSource: WorkspaceRouteSource): boolean {
  return routeSource === "cache" && viewer.route_kind === "canonical";
}

export function getPageMentionEffectiveShareToken(
  viewer: ResolvedViewerContext,
  shareToken: string | undefined,
): string | null {
  return viewer.principal_type === "link" && shareToken ? shareToken : null;
}

export function getPageMentionResolverScopeKey(viewer: ResolvedViewerContext, shareToken: string | undefined): string {
  return [
    viewer.access_mode,
    viewer.principal_type,
    viewer.route_kind,
    viewer.workspace_slug ?? "null",
    getPageMentionEffectiveShareToken(viewer, shareToken) ?? "no-link-token",
  ].join(":");
}
