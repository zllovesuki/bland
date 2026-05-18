import { useCallback, useMemo, useState } from "react";

import { useWorkspaceRole } from "@/client/components/workspace/use-workspace-view";
import { deriveSitePublishAffordance } from "@/client/lib/affordance/site-publish";
import { useOnline } from "@/client/hooks/use-online";
import { useAuthStore } from "@/client/stores/auth-store";
import { getSitePublishingEntitlements } from "@/shared/entitlements";

import { useShareController } from "./share-controller";
import { useSitePublishController } from "./site-publish-controller";
import type { DialogTab, ShareDialogProps, ShareDialogShellValue, ShareDialogSlices, WorkspaceRole } from "./types";

export function useShareDialogController({
  pageId,
  workspaceId,
  pageKind,
  disabled,
  title,
}: ShareDialogProps): ShareDialogSlices {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DialogTab>("share");
  const user = useAuthStore((s) => s.user);
  const online = useOnline();
  const workspaceRole: WorkspaceRole = useWorkspaceRole() ?? "none";
  const currentUserId = user?.id;

  const share = useShareController({
    pageId,
    disabled,
    open,
    workspaceRole,
    online,
    currentUserId,
  });

  const siteEntitlements = getSitePublishingEntitlements(workspaceRole);
  const publish = useSitePublishController({
    pageId,
    workspaceId,
    pageKind,
    canManageSite: siteEntitlements.manageSite,
    canViewPagePublishStatus: siteEntitlements.viewPagePublishStatus,
    open: open && !disabled,
  });

  const publishAffordance = useMemo(
    () =>
      deriveSitePublishAffordance({
        entitlements: siteEntitlements,
        online,
        pageKind,
      }),
    [siteEntitlements, online, pageKind],
  );

  const close = useCallback(() => {
    setOpen(false);
    share.people.dismissSuggestions();
  }, [share.people]);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    if (!open) {
      share.resetTransient();
    }
    setOpen((current) => !current);
  }, [disabled, open, share]);

  const shell = useMemo<ShareDialogShellValue>(
    () => ({
      disabled: disabled ?? false,
      title,
      open,
      loading: share.loading,
      creating: share.creating,
      error: share.error,
      dialogAffordance: share.dialogAffordance,
      publishAffordance,
      workspaceRole,
      online,
      currentUserId,
      activeTab,
      setActiveTab,
      toggleOpen,
      close,
      deleteShare: share.deleteShare,
    }),
    [
      disabled,
      title,
      open,
      share.loading,
      share.creating,
      share.error,
      share.dialogAffordance,
      share.deleteShare,
      publishAffordance,
      workspaceRole,
      online,
      currentUserId,
      activeTab,
      toggleOpen,
      close,
    ],
  );

  return { shell, people: share.people, link: share.link, publish };
}
