import { useMemo } from "react";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceMembers } from "@/client/stores/workspace-replica";
import { useActivePageState } from "@/client/components/active-page/use-active-page";
import { friendlyName } from "@/client/lib/friendly-name";
import type { ResolveIdentity } from "@/client/lib/presence-identity";

export interface CollabIdentity {
  userId: string | null;
  resolveIdentity: ResolveIdentity;
}

/**
 * Derives collaboration identity for the active page. Returns the signed-in
 * user's id (null when anonymous / share-token) and a memoized `resolveIdentity`
 * that maps awareness userId+clientId to a display identity. Workspace members
 * are the source of truth for names and avatars; share surfaces (where the
 * viewer isn't a workspace member) fall back to a generated friendlyName.
 *
 * Memoization is keyed on the members array so `CanvasSurface`'s depsRef
 * rebuild-avoidance stays intact — `resolveIdentity` only changes when members
 * add or remove.
 */
export function useCollabIdentity(): CollabIdentity {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const state = useActivePageState();
  const workspaceId = state.kind === "ready" ? state.snapshot.workspaceId : null;
  const members = useWorkspaceMembers(workspaceId);

  const resolveIdentity = useMemo<ResolveIdentity>(() => {
    const byId = new Map(members.map((m) => [m.user_id, m.user]));
    return (lookupUserId, clientId) => {
      const real = lookupUserId ? byId.get(lookupUserId) : undefined;
      if (real) return { name: real.name, avatar_url: real.avatar_url };
      return { name: friendlyName(lookupUserId ?? String(clientId)), avatar_url: null };
    };
  }, [members]);

  return { userId, resolveIdentity };
}
