import { useEffect, type ReactNode } from "react";
import { SharedPageMentionSurface } from "@/client/components/page-mention/shared-surface";
import { ActivePageProvider } from "@/client/components/active-page/provider";
import { useActivePageActions, useActivePageSync } from "@/client/components/active-page/use-active-page";
import { useReadyShareView } from "@/client/components/share/use-share-view";
import type { ActivePageInitialSnapshot } from "@/client/lib/active-page-model";
import { parseDocMessage } from "@/shared/doc-messages";

/**
 * Share boundary: keeps share-link resolution token-scoped in ShareViewProvider
 * and mounts active-page state only for the active shared page. The
 * `key={activePageId}` forces a remount on subpage↔root transitions so the
 * `initialSnapshot` seed for the root page lands via the useState initializer
 * rather than an effect — no intermediate paint with empty metadata.
 */
export function SharedActivePageBoundary({ children }: { children: ReactNode }) {
  const { token, workspaceId, rootPageId, rootPage, activePageId } = useReadyShareView();

  const initialSnapshot: ActivePageInitialSnapshot | null =
    activePageId === rootPageId
      ? {
          snapshot: {
            id: rootPage.id,
            workspaceId,
            title: rootPage.title,
            icon: rootPage.icon,
            coverUrl: rootPage.cover_url,
          },
          access: { mode: rootPage.permission },
        }
      : null;

  return (
    <ActivePageProvider
      key={activePageId}
      surface="shared"
      workspaceId={workspaceId}
      pageId={activePageId}
      accessMode="shared"
      role={null}
      cachedPageMeta={null}
      shareToken={token}
      initialSnapshot={initialSnapshot}
    >
      <SharedMetadataListener />
      <SharedPageMentionSurface>{children}</SharedPageMentionSurface>
    </ActivePageProvider>
  );
}

function SharedMetadataListener() {
  const { syncProvider } = useActivePageSync();
  const { patchPage } = useActivePageActions();

  useEffect(() => {
    if (!syncProvider) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        patchPage({ icon: msg.icon, coverUrl: msg.cover_url });
      }
    };
    syncProvider.on("custom-message", handler);
    return () => syncProvider.off("custom-message", handler);
  }, [syncProvider, patchPage]);

  return null;
}
