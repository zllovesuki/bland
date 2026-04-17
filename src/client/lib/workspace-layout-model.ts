import type { WorkspaceRouteState } from "@/client/lib/workspace-route-model";

export function shouldRedirectMemberOnlyRoute(route: WorkspaceRouteState, isMemberOnlyRoute: boolean): boolean {
  if (!isMemberOnlyRoute) return false;
  if (route.phase === "loading") return false;
  return !(route.phase === "ready" && route.accessMode === "member");
}

export function shouldBlockMemberOnlyRouteContent(route: WorkspaceRouteState, isMemberOnlyRoute: boolean): boolean {
  if (!isMemberOnlyRoute) return false;
  return !(route.phase === "ready" && route.accessMode === "member");
}
