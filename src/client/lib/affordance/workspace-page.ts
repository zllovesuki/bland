import {
  getPageEditEntitlements,
  getPageStructureEntitlements,
  type PageAccessLevel,
  type ResolvedWorkspaceRole,
} from "@/shared/entitlements";
import { deriveEditorAffordance, type EditorAffordance } from "@/client/lib/affordance/editor";
import {
  ENABLED_ACTION,
  HIDDEN_ACTION,
  disabledAction,
  OFFLINE_ACTION_REASON,
  type UiActionState,
} from "@/client/lib/affordance/action-state";
import { resolveArchiveAffordance } from "@/client/lib/affordance/archive";
import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";

export interface WorkspacePageAffordance {
  breadcrumbMode: "normal" | "restricted";
  shareDialog: UiActionState;
  editPageMetadata: UiActionState;
  archivePage: UiActionState;
  editor: EditorAffordance;
}

export function deriveWorkspacePageAffordance(input: {
  accessMode: WorkspaceAccessMode | null;
  workspaceRole: ResolvedWorkspaceRole;
  pageAccess: PageAccessLevel;
  ownsPage: boolean;
  workspaceId: string | undefined;
  online: boolean;
}): WorkspacePageAffordance {
  const { accessMode, workspaceRole, pageAccess, ownsPage, workspaceId, online } = input;
  const editEntitlements = getPageEditEntitlements("canonical", pageAccess);
  const structureEntitlements = getPageStructureEntitlements(workspaceRole, ownsPage);
  const canManageShares = accessMode === "member" && workspaceRole !== "guest" && workspaceRole !== "none";

  return {
    breadcrumbMode: accessMode === "shared" || workspaceRole === "guest" ? "restricted" : "normal",
    shareDialog: canManageShares ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_ACTION_REASON)) : HIDDEN_ACTION,
    editPageMetadata: editEntitlements.editPageMetadata
      ? online
        ? ENABLED_ACTION
        : disabledAction(OFFLINE_ACTION_REASON)
      : HIDDEN_ACTION,
    archivePage: resolveArchiveAffordance({
      archiveAnyPage: structureEntitlements.archiveAnyPage,
      archiveOwnPage: structureEntitlements.archiveOwnPage,
      ownsPage,
      online,
    }),
    editor: deriveEditorAffordance({
      surface: "canonical",
      pageAccess,
      workspaceId,
      online,
    }),
  };
}
