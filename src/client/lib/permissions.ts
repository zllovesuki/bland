import type { Page, User, WorkspaceMember } from "@/shared/types";

export function canArchivePage(members: WorkspaceMember[], currentUser: User | null, page: Page): boolean {
  if (!currentUser) return false;
  const myRole = members.find((m) => m.user_id === currentUser.id)?.role;
  return myRole === "owner" || myRole === "admin" || page.created_by === currentUser.id;
}
