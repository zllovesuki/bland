import { useEffect, type ReactNode } from "react";
import { SharedPageMentionSurface } from "@/client/components/page-mention/shared-surface";
import { PageSurfaceProvider } from "@/client/components/page-surface/provider";
import { usePageSurface } from "@/client/components/page-surface/use-page-surface";
import { useReadyShareView } from "@/client/components/share/use-share-view";
import { parseDocMessage } from "@/shared/doc-messages";

/**
 * Share adapter: keeps share-link resolution token-scoped in ShareViewProvider
 * and mounts page-surface state only for the active shared page.
 */
export function SharedPageSurface({ children }: { children: ReactNode }) {
  const { token, workspaceId, rootPageId, rootPage, activePageId } = useReadyShareView();

  return (
    <PageSurfaceProvider
      surface="share"
      workspaceId={workspaceId}
      pageId={activePageId}
      accessMode="shared"
      role={null}
      pageLoadTarget="live"
      cachedPage={null}
      shareToken={token}
      seedPage={
        activePageId === rootPageId
          ? {
              pageId: rootPage.id,
              workspaceId,
              title: rootPage.title,
              icon: rootPage.icon,
              cover_url: rootPage.cover_url,
              canEdit: rootPage.permission === "edit",
            }
          : null
      }
    >
      <SharedMetadataListener />
      <SharedPageMentionSurface>{children}</SharedPageMentionSurface>
    </PageSurfaceProvider>
  );
}

function SharedMetadataListener() {
  const { wsProvider, patchPage } = usePageSurface();
  const { rootPageId, patchRootPage } = useReadyShareView();

  useEffect(() => {
    if (!wsProvider) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        patchPage({ icon: msg.icon, cover_url: msg.cover_url });
        if (msg.pageId === rootPageId) {
          patchRootPage({ icon: msg.icon, cover_url: msg.cover_url });
        }
      }
    };
    wsProvider.on("custom-message", handler);
    return () => wsProvider.off("custom-message", handler);
  }, [wsProvider, rootPageId, patchRootPage, patchPage]);

  return null;
}
