import type { WorkspaceRole } from "@/shared/types";

export type EntitlementSurface = "canonical" | "shared";
export type PageAccessLevel = "none" | "view" | "edit";
export type ResolvedWorkspaceRole = WorkspaceRole | "none";

export function isWorkspaceWriterRole(role: ResolvedWorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function isWorkspaceAdminOrOwnerRole(role: ResolvedWorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
