import type { Page, WorkspaceRole } from "@/shared/types";
import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";

export interface PageCapabilities {
  /** Page body, title, icon, cover are writable. */
  canEdit: boolean;
  /** User has permission to create pages in this workspace. */
  canCreatePage: boolean;
  /** User has permission to archive this specific page. */
  canArchive: boolean;
  /** User has permission to open share for this page. */
  canShare: boolean;
  /** User has permission to drag/reorder pages in the tree. */
  canDrag: boolean;
  /** Editor mention insertion is allowed in the current surface. */
  canInsertMention: boolean;
}

export interface DerivePageCapabilitiesInput {
  page: Page & { can_edit?: boolean };
  accessMode: WorkspaceAccessMode | null;
  role: WorkspaceRole | null;
  currentUserId: string | null;
  online: boolean;
  shareToken: string | null;
}

function isWriterRole(role: WorkspaceRole | null): boolean {
  return role !== null && role !== "guest";
}

function isAdminOrOwner(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function derivePageCapabilities(input: DerivePageCapabilitiesInput): PageCapabilities {
  const { page, accessMode, role, currentUserId, online, shareToken } = input;
  const isShareLink = shareToken !== null;
  const isMember = accessMode === "member";

  const canEdit = page.can_edit !== false && online;
  const isMemberWriter = isMember && !isShareLink && isWriterRole(role);

  return {
    canEdit,
    canCreatePage: isMemberWriter,
    canArchive:
      isMember &&
      !isShareLink &&
      (isAdminOrOwner(role) || (currentUserId !== null && page.created_by === currentUserId)),
    canShare: isMemberWriter && online,
    canDrag: isMember && !isShareLink && online,
    canInsertMention: isMemberWriter,
  };
}
