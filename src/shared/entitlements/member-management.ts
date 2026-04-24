import { isWorkspaceAdminOrOwnerRole, type ResolvedWorkspaceRole } from "@/shared/entitlements/common";
import type { InviteRole } from "@/shared/types";

// Role-change policy. Mirrors the invariants enforced at
// src/worker/routes/workspaces.ts for PATCH /workspaces/:id/members/:uid:
//   - only admin or owner can reach this action
//   - owner cannot have their role changed
//   - only the owner can promote anyone to admin
// Applied symmetrically on the worker (authoritative) and the client (for
// affordance gating on the settings members list).
export function canChangeMemberRole(
  viewerRole: ResolvedWorkspaceRole,
  targetRole: ResolvedWorkspaceRole,
  newRole: InviteRole,
): boolean {
  if (!isWorkspaceAdminOrOwnerRole(viewerRole)) return false;
  if (targetRole === "owner") return false;
  if (newRole === "admin" && viewerRole !== "owner") return false;
  return true;
}

// Removal policy. Mirrors DELETE /workspaces/:id/members/:uid:
//   - self-removal is allowed for anyone except owner
//   - otherwise caller must be admin or owner
//   - owner cannot be removed
//   - admin cannot remove another admin
export function canRemoveMember(
  viewerRole: ResolvedWorkspaceRole,
  targetRole: ResolvedWorkspaceRole,
  isSelf: boolean,
): boolean {
  if (isSelf) return viewerRole !== "owner" && viewerRole !== "none";
  if (!isWorkspaceAdminOrOwnerRole(viewerRole)) return false;
  if (targetRole === "owner") return false;
  if (targetRole === "admin" && viewerRole !== "owner") return false;
  return true;
}

// Self-leave affordance shorthand. Owners cannot leave; non-members have
// nothing to leave. Everyone else (admin, member, guest) can self-exit via the
// same DELETE route that powers removal.
export function canLeaveWorkspace(viewerRole: ResolvedWorkspaceRole): boolean {
  return viewerRole !== "owner" && viewerRole !== "none";
}
