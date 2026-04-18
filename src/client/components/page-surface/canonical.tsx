import { useEffect, useMemo, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { getMyRole } from "@/client/lib/permissions";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useCanonicalPageContext } from "@/client/components/workspace/use-canonical-page-context";
import { PageSurfaceProvider } from "@/client/components/page-surface/provider";
import { usePageSurface } from "@/client/components/page-surface/use-page-surface";
import { parseDocMessage } from "@/shared/doc-messages";
import type { Page } from "@/shared/types";

/**
 * Canonical adapter: mounts the shared PageSurfaceProvider with canonical
 * inputs, wires snapshot mutators as cache side-effects, and listens for
 * real-time metadata updates on the active doc's WebSocket.
 */
export function CanonicalPageSurface({ children }: { children: ReactNode }) {
  const params = useParams({ strict: false }) as { workspaceSlug: string; pageId: string };
  const {
    workspaceId: effectiveWorkspaceId,
    members,
    accessMode,
    pageLoadTarget,
    cachedPage,
  } = useCanonicalPageContext();
  const currentUser = useAuthStore((s) => s.user);
  const role = getMyRole(members, currentUser);

  const upsertPage = useWorkspaceStore((s) => s.upsertPageInSnapshot);
  const removePage = useWorkspaceStore((s) => s.removePageFromSnapshot);

  const onLivePageLoaded = useMemo(
    () => (page: Page & { can_edit?: boolean }) => {
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
    <PageSurfaceProvider
      surface="canonical"
      workspaceId={effectiveWorkspaceId}
      pageId={params.pageId}
      accessMode={accessMode}
      role={role}
      pageLoadTarget={pageLoadTarget}
      cachedPage={cachedPage}
      shareToken={null}
      seedPage={null}
      onLivePageLoaded={onLivePageLoaded}
      onEvict={onEvict}
    >
      <CanonicalMetadataListener />
      {children}
    </PageSurfaceProvider>
  );
}

/** Subscribes to the active doc's WebSocket for metadata updates pushed from peers. */
function CanonicalMetadataListener() {
  const { wsProvider, patchPage } = usePageSurface();
  const { workspace } = useCanonicalPageContext();
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);

  useEffect(() => {
    if (!wsProvider || !workspace) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        patchPage({ icon: msg.icon, cover_url: msg.cover_url });
        updatePage(workspace.id, msg.pageId, { icon: msg.icon, cover_url: msg.cover_url });
      }
    };
    wsProvider.on("custom-message", handler);
    return () => wsProvider.off("custom-message", handler);
  }, [wsProvider, workspace, updatePage, patchPage]);
  return null;
}
