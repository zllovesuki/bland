import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceMembers } from "@/client/components/workspace/use-workspace-view";
import { getMyRole, isWorkspaceAdminOrOwner as checkAdminOrOwner } from "@/client/lib/workspace-role";
import type { WorkspaceRole } from "@/shared/types";

interface RoleInfo {
  role: WorkspaceRole | null;
  isOwner: boolean;
  isAdminOrOwner: boolean;
}

export function useMyRole(): RoleInfo {
  const members = useWorkspaceMembers();
  const user = useAuthStore((s) => s.user);
  const role = getMyRole(members, user);
  return { role, isOwner: role === "owner", isAdminOrOwner: checkAdminOrOwner(role) };
}
