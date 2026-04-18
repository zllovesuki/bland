import { getPageStructureEntitlements, type ResolvedWorkspaceRole } from "@/shared/entitlements";
import {
  ENABLED_ACTION,
  HIDDEN_ACTION,
  disabledAction,
  type UiActionState,
} from "@/client/lib/affordance/action-state";

const OFFLINE_REASON = "You're offline";

export interface SidebarBaseAffordance {
  createPage: UiActionState;
  dragTree: UiActionState;
}

export interface SidebarRowAffordance {
  createSubpage: UiActionState;
  archivePage: UiActionState;
  dragPage: UiActionState;
}

export function deriveSidebarBaseAffordance(input: {
  workspaceRole: ResolvedWorkspaceRole;
  online: boolean;
}): SidebarBaseAffordance {
  const { workspaceRole, online } = input;
  const entitlements = getPageStructureEntitlements(workspaceRole, false);

  return {
    createPage: entitlements.createPage ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_REASON)) : HIDDEN_ACTION,
    dragTree: entitlements.movePage ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_REASON)) : HIDDEN_ACTION,
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
    createSubpage: entitlements.createPage ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_REASON)) : HIDDEN_ACTION,
    archivePage: entitlements.archivePage ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_REASON)) : HIDDEN_ACTION,
    dragPage: entitlements.movePage ? (online ? ENABLED_ACTION : disabledAction(OFFLINE_REASON)) : HIDDEN_ACTION,
  };
}
