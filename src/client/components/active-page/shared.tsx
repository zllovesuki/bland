import { useEffect, type ReactNode } from "react";
import { SharedPageMentionSurface } from "@/client/components/page-mention/shared-surface";
import { ActivePageProvider } from "@/client/components/active-page/provider";
import { useActivePageActions, useActivePageSync } from "@/client/components/active-page/use-active-page";
import { useReadyShareView } from "@/client/components/share/use-share-view";
import { parseDocMessage } from "@/shared/doc-messages";

/**
 * Share boundary: keeps share-link resolution token-scoped in ShareViewProvider
 * and mounts active-page state only for the active shared page.
 */
export function SharedActivePageBoundary({ children }: { children: ReactNode }) {
  const { token, workspaceId, rootPageId, rootPage, activePageId } = useReadyShareView();

  return (
    <ActivePageProvider
      surface="shared"
      workspaceId={workspaceId}
      pageId={activePageId}
      accessMode="shared"
      role={null}
      pageLoadTarget="live"
      cachedPageMeta={null}
      shareToken={token}
      seedPage={
        activePageId === rootPageId
          ? {
              pageId: rootPage.id,
              workspaceId,
              title: rootPage.title,
              icon: rootPage.icon,
              coverUrl: rootPage.cover_url,
              accessMode: rootPage.permission,
            }
          : null
      }
    >
      <SharedMetadataListener />
      <SharedPageMentionSurface>{children}</SharedPageMentionSurface>
    </ActivePageProvider>
  );
}

function SharedMetadataListener() {
  const { syncProvider } = useActivePageSync();
  const { patchPage } = useActivePageActions();
  const { rootPageId, patchRootPage } = useReadyShareView();

  useEffect(() => {
    if (!syncProvider) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        patchPage({ icon: msg.icon, coverUrl: msg.cover_url });
        if (msg.pageId === rootPageId) {
          patchRootPage({ icon: msg.icon, cover_url: msg.cover_url });
        }
      }
    };
    syncProvider.on("custom-message", handler);
    return () => syncProvider.off("custom-message", handler);
  }, [syncProvider, rootPageId, patchRootPage, patchPage]);

  return null;
}
