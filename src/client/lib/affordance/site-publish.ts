import type { SitePublishingEntitlements } from "@/shared/entitlements";
import {
  ENABLED_ACTION,
  HIDDEN_ACTION,
  disabledAction,
  OFFLINE_ACTION_REASON,
  type UiActionState,
} from "@/client/lib/affordance/action-state";
import type { PageKind } from "@/shared/types";

export interface SitePublishAffordance {
  // Whole tab is hidden when the workspace surface should not expose
  // publishing controls at all (canvas pages, no membership).
  showPublishTab: boolean;
  // Owner/admin-only management controls share one policy: visible for
  // managers, disabled while offline, hidden for everyone else.
  manageSite: UiActionState;
}

export interface DeriveSitePublishAffordanceInput {
  entitlements: SitePublishingEntitlements;
  online: boolean;
  pageKind: PageKind;
}

export function deriveSitePublishAffordance(input: DeriveSitePublishAffordanceInput): SitePublishAffordance {
  const { entitlements, online, pageKind } = input;
  const canvas = pageKind === "canvas";
  const manageSite = !entitlements.manageSite
    ? HIDDEN_ACTION
    : online
      ? ENABLED_ACTION
      : disabledAction(OFFLINE_ACTION_REASON);

  return {
    showPublishTab: entitlements.viewPagePublishStatus && !canvas,
    manageSite,
  };
}
