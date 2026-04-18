import { getPageStructureEntitlements, type ResolvedWorkspaceRole } from "@/shared/entitlements";
import {
  ENABLED_ACTION,
  HIDDEN_ACTION,
  disabledAction,
  OFFLINE_ACTION_REASON,
  type UiActionState,
} from "@/client/lib/affordance/action-state";
import { resolveArchiveAffordance } from "@/client/lib/affordance/archive";

export interface SidebarBaseAffordance {
  createPage: UiActionState;
}

export interface SidebarRowAffordance {
  createSubpage: UiActionState;
  movePage: UiActionState;
  archivePage: UiActionState;
}

export function deriveSidebarBaseAffordance(input: {
  workspaceRole: ResolvedWorkspaceRole;
  online: boolean;
}): SidebarBaseAffordance {
  const { workspaceRole, online } = input;
  const entitlements = getPageStructureEntitlements(workspaceRole, false);

  return {
    createPage: entitlements.createPage
      ? online
        ? ENABLED_ACTION
        : disabledAction(OFFLINE_ACTION_REASON)
      : HIDDEN_ACTION,
  };
}

export function deriveSidebarRowAffordance(input: {
  workspaceRole: ResolvedWorkspaceRole;
  ownsPage: boolean;
  online: boolean;
}): SidebarRowAffordance {
  const { workspaceRole, ownsPage, online } = input;
  const entitlements = getPageStructureEntitlements(workspaceRole, ownsPage);

  return {
    createSubpage: entitlements.createPage
      ? online
        ? ENABLED_ACTION
        : disabledAction(OFFLINE_ACTION_REASON)
      : HIDDEN_ACTION,
    movePage: entitlements.movePage ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_ACTION_REASON)) : HIDDEN_ACTION,
    archivePage: resolveArchiveAffordance({
      archiveAnyPage: entitlements.archiveAnyPage,
      archiveOwnPage: entitlements.archiveOwnPage,
      ownsPage,
      online,
    }),
  };
}
