import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SharedPageTree } from "@/client/components/sidebar/shared-page-tree";
import { MobileDrawer } from "@/client/components/ui/mobile-drawer";
import { useReadyShareView } from "@/client/components/share/use-share-view";
import { pageAncestorsQueryOptions } from "@/client/lib/queries/page-ancestors";

interface ShareSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function ShareSidebar({ mobileOpen, onMobileClose }: ShareSidebarProps) {
  const share = useReadyShareView();
  const ancestorsQuery = useQuery({
    ...pageAncestorsQueryOptions(share.workspaceId, share.activePageId, share.token),
    enabled: share.activePageId !== share.rootPageId,
  });

  const autoExpandPathIds = useMemo(() => {
    if (share.activePageId === share.rootPageId) return [];
    const ancestors = ancestorsQuery.data ?? [];
    const rootIndex = ancestors.findIndex((ancestor) => ancestor.id === share.rootPageId);
    const scopedAncestors = rootIndex >= 0 ? ancestors.slice(rootIndex + 1) : ancestors;
    return [...scopedAncestors.map((ancestor) => ancestor.id), share.activePageId].filter(
      (pageId) => pageId !== share.rootPageId,
    );
  }, [ancestorsQuery.data, share.activePageId, share.rootPageId]);

  return (
    <MobileDrawer open={mobileOpen} onClose={onMobileClose}>
      <SharedPageTree
        workspaceId={share.workspaceId}
        rootPage={share.rootPage}
        shareToken={share.token}
        activePageId={share.activePageId}
        autoExpandPathIds={autoExpandPathIds}
        onNavigate={(pageId) => {
          share.navigate(pageId);
          onMobileClose();
        }}
      />
    </MobileDrawer>
  );
}
