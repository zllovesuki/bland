import type { User, WorkspaceMember, WorkspaceRole } from "@/shared/types";

export function getMyRole(members: WorkspaceMember[], currentUser: User | null): WorkspaceRole | null {
  if (!currentUser) return null;
  return members.find((m) => m.user_id === currentUser.id)?.role ?? null;
}

export function isWorkspaceAdminOrOwner(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}
