import { useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { DocumentPage } from "@/client/components/editor/document-page";
import { CanvasPage } from "@/client/components/canvas/canvas-page";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { PageBreadcrumbs } from "@/client/components/ui/page-breadcrumbs";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { PAGE_CONTENT_COLUMN_CLASS } from "@/client/components/ui/page-layout";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useOnline } from "@/client/hooks/use-online";
import {
  useActivePageActions,
  useActivePageState,
  useActivePageSync,
} from "@/client/components/active-page/use-active-page";
import { useSharedPagePresentation } from "@/client/components/share/use-share-view";
import { deriveSharePageAffordance } from "@/client/lib/affordance/share-page";

function SharedBreadcrumbSkeleton() {
  return (
    <div className="text-xs" aria-hidden="true">
      <div className="hidden items-center gap-2 md:flex">
        <Skeleton className="h-3.5 w-20 rounded-sm" />
        <ChevronRight className="h-3 w-3 shrink-0 text-zinc-700" />
        <Skeleton className="h-3.5 w-24 rounded-sm" />
        <ChevronRight className="h-3 w-3 shrink-0 text-zinc-700" />
        <Skeleton className="h-3.5 w-28 rounded-sm" />
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <Skeleton className="h-3.5 w-24 rounded-sm" />
        <ChevronRight className="h-3 w-3 shrink-0 text-zinc-700" />
        <Skeleton className="h-3.5 w-3 rounded-sm" />
      </div>
    </div>
  );
}

export function SharePageView() {
  const activePageState = useActivePageState();
  const { patchPage } = useActivePageActions();
  const { setSyncProvider } = useActivePageSync();
  const presentation = useSharedPagePresentation();
  const online = useOnline();
  const handleTitleChange = useCallback(
    (titleOverride: string) => {
      patchPage({ title: titleOverride });
    },
    [patchPage],
  );

  useDocumentTitle(presentation.displayTitle || DEFAULT_PAGE_TITLE);

  if (activePageState.kind === "unavailable") {
    return (
      <PageErrorState
        message={presentation.unavailableMessage ?? activePageState.message}
        className="h-full"
        action={{
          label: "Back to shared page",
          onClick: () => presentation.navigate(presentation.rootPageId),
        }}
      />
    );
  }

  if (presentation.isPageLoading || !presentation.page) {
    return (
      <PageLoadingSkeleton
        canvasLayout="stage"
        kind={presentation.isRootActive ? presentation.rootPage.kind : "unknown"}
      />
    );
  }

  const page = presentation.page;
  const showBreadcrumbSlot = presentation.isAncestorTrailLoading || presentation.ancestors.length > 0;
  const pageAffordance = deriveSharePageAffordance({
    pageKind: page.kind,
    pageAccess: presentation.isViewOnly ? "view" : "edit",
    workspaceId: presentation.workspaceId,
    online,
  });

  const sharedChrome = <SharedPageChrome presentation={presentation} showBreadcrumbSlot={showBreadcrumbSlot} />;

  if (pageAffordance.kind === "doc") {
    return (
      <DocumentPage
        pageId={page.id}
        initialTitle={page.title}
        onTitleChange={handleTitleChange}
        onProvider={setSyncProvider}
        shareToken={presentation.token}
        workspaceId={presentation.workspaceId}
        affordance={pageAffordance.editor}
        outlineMode="rail"
        chrome={sharedChrome}
      />
    );
  }

  return (
    <CanvasPage
      pageId={page.id}
      initialTitle={page.title}
      onTitleChange={handleTitleChange}
      onProvider={setSyncProvider}
      shareToken={presentation.token}
      workspaceId={presentation.workspaceId}
      affordance={pageAffordance.canvas}
      layout="stage"
      chrome={sharedChrome}
    />
  );
}

interface SharedPageChromeProps {
  presentation: ReturnType<typeof useSharedPagePresentation>;
  showBreadcrumbSlot: boolean;
}

function SharedPageChrome({ presentation, showBreadcrumbSlot }: SharedPageChromeProps) {
  return (
    <>
      <div className={PAGE_CONTENT_COLUMN_CLASS}>
        {presentation.displayCoverUrl && (
          <div className="-mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0">
            <PageCover coverUrl={presentation.displayCoverUrl} shareToken={presentation.token} />
          </div>
        )}

        {showBreadcrumbSlot && (
          <div className="mb-6 flex min-h-6 min-w-0 items-center">
            {presentation.isAncestorTrailLoading ? (
              <SharedBreadcrumbSkeleton />
            ) : (
              <PageBreadcrumbs
                mode="shared"
                ancestors={presentation.ancestors}
                currentTitle={presentation.displayTitle}
                currentIcon={presentation.displayIcon}
                onNavigate={presentation.navigate}
              />
            )}
          </div>
        )}

        {presentation.displayIcon && (
          <div className="mb-4 pl-7">
            <EmojiIcon emoji={presentation.displayIcon} size={28} />
          </div>
        )}
      </div>
    </>
  );
}
