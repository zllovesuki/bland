import { useEffect, useMemo, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { getMyRole } from "@/client/lib/workspace-role";
import { CanonicalPageMentionSurface } from "@/client/components/page-mention/canonical-surface";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useCanonicalPageContext } from "@/client/components/workspace/use-canonical-page-context";
import { ActivePageProvider } from "@/client/components/active-page/provider";
import { useActivePageActions, useActivePageSync } from "@/client/components/active-page/use-active-page";
import { parseDocMessage } from "@/shared/doc-messages";
import type { Page } from "@/shared/types";

/**
 * Canonical boundary: mounts the shared ActivePageProvider with canonical
 * inputs, wires snapshot mutators as cache side-effects, and listens for
 * real-time metadata updates on the active doc's WebSocket.
 */
export function CanonicalActivePageBoundary({ children }: { children: ReactNode }) {
  const params = useParams({ strict: false }) as { workspaceSlug: string; pageId: string };
  const {
    workspaceId: effectiveWorkspaceId,
    members,
    accessMode,
    pageLoadTarget,
    currentPageMeta,
  } = useCanonicalPageContext();
  const currentUser = useAuthStore((s) => s.user);
  const role = getMyRole(members, currentUser);

  const upsertPage = useWorkspaceStore((s) => s.upsertPageInSnapshot);
  const removePage = useWorkspaceStore((s) => s.removePageFromSnapshot);

  const onLivePageLoaded = useMemo(
    () => (page: Page) => {
      if (!effectiveWorkspaceId) return;
      upsertPage(effectiveWorkspaceId, page);
    },
    [effectiveWorkspaceId, upsertPage],
  );

  const onEvict = useMemo(
    () => (id: string) => {
      if (!effectiveWorkspaceId) return;
      removePage(effectiveWorkspaceId, id);
    },
    [effectiveWorkspaceId, removePage],
  );

  return (
    <ActivePageProvider
      surface="canonical"
      workspaceId={effectiveWorkspaceId}
      pageId={params.pageId}
      accessMode={accessMode}
      role={role}
      pageLoadTarget={pageLoadTarget}
      cachedPageMeta={currentPageMeta}
      shareToken={null}
      seedPage={null}
      onLivePageLoaded={onLivePageLoaded}
      onEvict={onEvict}
    >
      <CanonicalMetadataListener />
      <CanonicalPageMentionSurface>{children}</CanonicalPageMentionSurface>
    </ActivePageProvider>
  );
}

function CanonicalMetadataListener() {
  const { syncProvider } = useActivePageSync();
  const { patchPage } = useActivePageActions();
  const { workspace } = useCanonicalPageContext();
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);

  useEffect(() => {
    if (!syncProvider || !workspace) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        patchPage({ icon: msg.icon, coverUrl: msg.cover_url });
        updatePage(workspace.id, msg.pageId, { icon: msg.icon, cover_url: msg.cover_url });
      }
    };
    syncProvider.on("custom-message", handler);
    return () => syncProvider.off("custom-message", handler);
  }, [syncProvider, workspace, updatePage, patchPage]);
  return null;
}
