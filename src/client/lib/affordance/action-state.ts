export type UiActionState = { kind: "enabled" } | { kind: "disabled"; reason?: string } | { kind: "hidden" };

export const ENABLED_ACTION: UiActionState = { kind: "enabled" };
export const HIDDEN_ACTION: UiActionState = { kind: "hidden" };
export const OFFLINE_ACTION_REASON = "You're offline";
export const ARCHIVE_OWNERSHIP_ACTION_REASON = "Only the page creator can archive this";

export function disabledAction(reason?: string): UiActionState {
  return { kind: "disabled", reason };
}

export function isActionVisible(action: UiActionState): boolean {
  return action.kind !== "hidden";
}

export function isActionEnabled(action: UiActionState): boolean {
  return action.kind === "enabled";
}
