import { canCreateLinkShare, canRevokeShare, type ResolvedWorkspaceRole } from "@/shared/entitlements";
import {
  ENABLED_ACTION,
  HIDDEN_ACTION,
  disabledAction,
  isActionVisible,
  OFFLINE_ACTION_REASON,
  type UiActionState,
} from "@/client/lib/affordance/action-state";
import type { PageShare } from "@/shared/types";

export interface ShareDialogAffordance {
  showPeopleSection: boolean;
  showLinkSection: boolean;
  createUserShare: UiActionState;
  createLinkShare: UiActionState;
}

export interface ShareDialogRowAffordance {
  revoke: UiActionState;
  copyLink: UiActionState;
}

export function deriveShareDialogAffordance(input: {
  workspaceRole: ResolvedWorkspaceRole;
  online: boolean;
  hasUserShares: boolean;
  hasLinkShares: boolean;
}): ShareDialogAffordance {
  const { workspaceRole, online, hasUserShares, hasLinkShares } = input;
  const canCreateUserShare = workspaceRole !== "guest" && workspaceRole !== "none";
  const createUserShare = canCreateUserShare
    ? online
      ? ENABLED_ACTION
      : disabledAction(OFFLINE_ACTION_REASON)
    : HIDDEN_ACTION;
  const createLinkShare = canCreateLinkShare(workspaceRole)
    ? online
      ? ENABLED_ACTION
      : disabledAction(OFFLINE_ACTION_REASON)
    : HIDDEN_ACTION;

  return {
    showPeopleSection: canCreateUserShare || hasUserShares,
    showLinkSection: hasLinkShares || isActionVisible(createLinkShare),
    createUserShare,
    createLinkShare,
  };
}

export function deriveShareDialogRowAffordance(input: {
  workspaceRole: ResolvedWorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
  share: PageShare;
  granteeIsWorkspaceMember: boolean;
}): ShareDialogRowAffordance {
  const { workspaceRole, online, currentUserId, share, granteeIsWorkspaceMember } = input;
  const canRevoke = canRevokeShare({
    workspaceRole,
    granteeType: share.grantee_type,
    shareCreatedByViewer: share.created_by === currentUserId,
    granteeIsWorkspaceMember,
  });

  return {
    revoke: canRevoke ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_ACTION_REASON)) : HIDDEN_ACTION,
    copyLink: share.link_token ? ENABLED_ACTION : HIDDEN_ACTION,
  };
}
