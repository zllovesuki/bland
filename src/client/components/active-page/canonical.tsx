import { useEffect, useRef, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { CanonicalPageMentionSurface } from "@/client/components/page-mention/canonical-surface";
import { usePageAccessMode } from "@/client/stores/workspace-replica";
import { replicaCommands } from "@/client/stores/db/workspace-replica";
import { useCanonicalPageContext } from "@/client/components/workspace/use-canonical-page-context";
import { ActivePageProvider } from "@/client/components/active-page/provider";
import { useActivePageActions, useActivePageSync } from "@/client/components/active-page/use-active-page";
import { parseDocMessage } from "@/shared/doc-messages";
import type { ActivePageAccess } from "@/client/lib/active-page-model";
import type { Page } from "@/shared/types";

/**
 * Canonical boundary: mounts the shared ActivePageProvider with canonical
 * inputs, wires replica mutators as cache side-effects, and listens for
 * real-time metadata updates on the active doc's WebSocket.
 */
export function CanonicalActivePageBoundary({ children }: { children: ReactNode }) {
  const params = useParams({ strict: false }) as { workspaceSlug: string; pageId: string };
  const { workspaceId: effectiveWorkspaceId, accessMode, workspaceRole, currentPageMeta } = useCanonicalPageContext();
  // Role flows from the workspace replica so restricted-ancestor loading does
  // not depend on the `/members` fetch (which is empty on shared-surface
  // replicas and scoped to self on guest surfaces).
  const role = workspaceRole;

  const cachedAccess = usePageAccessMode(params.pageId);

  const onLivePageLoaded = (page: Page, access: ActivePageAccess) => {
    if (!effectiveWorkspaceId) return;
    void replicaCommands.upsertPage(effectiveWorkspaceId, page);
    void replicaCommands.upsertPageAccess(page.id, access.mode);
  };

  const onEvict = (id: string) => {
    if (!effectiveWorkspaceId) return;
    void replicaCommands.removePage(effectiveWorkspaceId, id);
  };

  return (
    <ActivePageProvider
      surface="canonical"
      workspaceId={effectiveWorkspaceId}
      pageId={params.pageId}
      accessMode={accessMode}
      role={role}
      cachedPageMeta={currentPageMeta}
      cachedAccess={cachedAccess}
      shareToken={null}
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
  const workspaceId = workspace?.id ?? null;

  const patchPageRef = useRef(patchPage);
  patchPageRef.current = patchPage;

  useEffect(() => {
    if (!syncProvider || !workspaceId) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        patchPageRef.current({ icon: msg.icon, coverUrl: msg.cover_url });
        void replicaCommands.patchPage(workspaceId, msg.pageId, {
          icon: msg.icon,
          cover_url: msg.cover_url,
        });
      }
    };
    syncProvider.on("custom-message", handler);
    return () => syncProvider.off("custom-message", handler);
  }, [syncProvider, workspaceId]);
  return null;
}
