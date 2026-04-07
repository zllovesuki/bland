import type { Page, User, WorkspaceMember, WorkspaceRole } from "@/shared/types";

export function getMyRole(members: WorkspaceMember[], currentUser: User | null): WorkspaceRole | null {
  if (!currentUser) return null;
  return members.find((m) => m.user_id === currentUser.id)?.role ?? null;
}

export function isAdminOrOwner(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function canCreatePage(members: WorkspaceMember[], currentUser: User | null): boolean {
  const role = getMyRole(members, currentUser);
  return role !== null && role !== "guest";
}

export function canArchivePage(members: WorkspaceMember[], currentUser: User | null, page: Page): boolean {
  if (!currentUser) return false;
  const myRole = getMyRole(members, currentUser);
  return isAdminOrOwner(myRole) || page.created_by === currentUser.id;
}
