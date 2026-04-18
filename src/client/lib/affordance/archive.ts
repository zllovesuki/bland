import {
  ENABLED_ACTION,
  HIDDEN_ACTION,
  disabledAction,
  OFFLINE_ACTION_REASON,
  ARCHIVE_OWNERSHIP_ACTION_REASON,
  type UiActionState,
} from "@/client/lib/affordance/action-state";

export function resolveArchiveAffordance(input: {
  archiveAnyPage: boolean;
  archiveOwnPage: boolean;
  ownsPage: boolean;
  online: boolean;
}): UiActionState {
  const { archiveAnyPage, archiveOwnPage, ownsPage, online } = input;
  if (!archiveAnyPage && !archiveOwnPage) return HIDDEN_ACTION;
  if (!archiveAnyPage && !ownsPage) return disabledAction(ARCHIVE_OWNERSHIP_ACTION_REASON);
  return online ? ENABLED_ACTION : disabledAction(OFFLINE_ACTION_REASON);
}
