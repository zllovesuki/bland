export function canEdit(role: string): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function isAdminOrOwner(role: string): boolean {
  return role === "owner" || role === "admin";
}
