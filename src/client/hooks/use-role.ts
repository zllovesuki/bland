import { useWorkspaceStore, selectActiveMembers } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { getMyRole, isAdminOrOwner as checkAdminOrOwner } from "@/client/lib/permissions";
import type { WorkspaceRole } from "@/shared/types";

interface RoleInfo {
  role: WorkspaceRole | null;
  isOwner: boolean;
  isAdminOrOwner: boolean;
}

export function useMyRole(): RoleInfo {
  const members = useWorkspaceStore(selectActiveMembers);
  const user = useAuthStore((s) => s.user);
  const role = getMyRole(members, user);
  return { role, isOwner: role === "owner", isAdminOrOwner: checkAdminOrOwner(role) };
}
