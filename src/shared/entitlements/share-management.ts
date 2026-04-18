import { isWorkspaceAdminOrOwnerRole, type ResolvedWorkspaceRole } from "@/shared/entitlements/common";
import type { GranteeType } from "@/shared/types";

export function canCreateUserShare(workspaceRole: ResolvedWorkspaceRole, targetIsWorkspaceMember: boolean): boolean {
  if (workspaceRole === "guest" || workspaceRole === "none") return false;
  if (isWorkspaceAdminOrOwnerRole(workspaceRole)) return true;
  return targetIsWorkspaceMember;
}

export function canCreateUserShareByEmail(workspaceRole: ResolvedWorkspaceRole): boolean {
  return isWorkspaceAdminOrOwnerRole(workspaceRole);
}

export function canCreateLinkShare(workspaceRole: ResolvedWorkspaceRole): boolean {
  return isWorkspaceAdminOrOwnerRole(workspaceRole);
}

export function canRevokeShare(options: {
  workspaceRole: ResolvedWorkspaceRole;
  granteeType: GranteeType;
  shareCreatedByViewer: boolean;
  granteeIsWorkspaceMember: boolean;
}): boolean {
  const { workspaceRole, granteeType, shareCreatedByViewer, granteeIsWorkspaceMember } = options;
  if (workspaceRole === "guest" || workspaceRole === "none") return false;
  if (isWorkspaceAdminOrOwnerRole(workspaceRole)) return true;

  return granteeType === "user" && shareCreatedByViewer && granteeIsWorkspaceMember;
}

export function canRevealLinkTokens(workspaceRole: ResolvedWorkspaceRole): boolean {
  return isWorkspaceAdminOrOwnerRole(workspaceRole);
}

export function canRevealShareGranteeEmails(workspaceRole: ResolvedWorkspaceRole): boolean {
  return workspaceRole !== "guest" && workspaceRole !== "none";
}
