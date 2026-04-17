import { SharedPageTree } from "@/client/components/sidebar/shared-page-tree";
import { MobileDrawer } from "@/client/components/ui/mobile-drawer";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useShareView } from "@/client/components/share/use-share-view";

interface ShareSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function ShareSidebar({ mobileOpen, onMobileClose }: ShareSidebarProps) {
  const { info, displayPageId, handleNavigate } = useShareView();

  if (!info) {
    return (
      <nav
        className="hidden w-56 shrink-0 border-r border-zinc-800/60 bg-zinc-900 px-2 py-4 md:block"
        aria-hidden="true"
      >
        <Skeleton className="h-5 w-3/4" />
      </nav>
    );
  }

  const effectivePageId = displayPageId ?? info.page_id;

  return (
    <MobileDrawer open={mobileOpen} onClose={onMobileClose}>
      <SharedPageTree
        workspaceId={info.workspace_id}
        rootPageId={info.page_id}
        rootTitle={info.title}
        rootIcon={info.icon}
        shareToken={info.token}
        activePageId={effectivePageId}
        onNavigate={(pageId) => {
          handleNavigate(pageId);
          onMobileClose();
        }}
      />
    </MobileDrawer>
  );
}
