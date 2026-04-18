import { SharedPageTree } from "@/client/components/sidebar/shared-page-tree";
import { MobileDrawer } from "@/client/components/ui/mobile-drawer";
import { useSharedPagePresentation } from "@/client/components/share/use-share-view";

interface ShareSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function ShareSidebar({ mobileOpen, onMobileClose }: ShareSidebarProps) {
  const presentation = useSharedPagePresentation();

  return (
    <MobileDrawer open={mobileOpen} onClose={onMobileClose}>
      <SharedPageTree
        workspaceId={presentation.workspaceId}
        rootPage={presentation.rootPage}
        shareToken={presentation.token}
        activePageId={presentation.activePageId}
        onNavigate={(pageId) => {
          presentation.navigate(pageId);
          onMobileClose();
        }}
      />
    </MobileDrawer>
  );
}
