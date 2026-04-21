import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { ErrorBoundary } from "@/client/components/error-boundary";
import { friendlyName } from "@/client/lib/friendly-name";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { PageBreadcrumbs } from "@/client/components/ui/page-breadcrumbs";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useMediaQuery } from "@/client/hooks/use-media-query";
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
    <div className="flex items-center gap-2 text-xs" aria-hidden="true">
      <Skeleton className="h-3.5 w-20 rounded-sm" />
      <ChevronRight className="h-3 w-3 shrink-0 text-zinc-700" />
      <Skeleton className="h-3.5 w-24 rounded-sm" />
      <ChevronRight className="h-3 w-3 shrink-0 text-zinc-700" />
      <Skeleton className="h-3.5 w-28 rounded-sm" />
    </div>
  );
}

export function SharePageView() {
  const activePageState = useActivePageState();
  const { patchPage } = useActivePageActions();
  const { setSyncProvider } = useActivePageSync();
  const presentation = useSharedPagePresentation();
  const online = useOnline();
  const [outlineRailEl, setOutlineRailEl] = useState<HTMLDivElement | null>(null);
  const showOutlineRail = useMediaQuery("(min-width: 1024px)");
  const handleTitleChange = useCallback(
    (titleOverride: string) => {
      patchPage({ title: titleOverride });
    },
    [patchPage],
  );

  useDocumentTitle(presentation.displayTitle || DEFAULT_PAGE_TITLE);

  const resolveIdentity = useCallback<ResolveIdentity>(
    (userId, clientId) => ({
      name: friendlyName(userId ?? String(clientId)),
      avatar_url: null,
    }),
    [],
  );

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
    return <PageLoadingSkeleton />;
  }

  const page = presentation.page;
  const showBreadcrumbSlot = presentation.isAncestorTrailLoading || presentation.ancestors.length > 0;
  const pageAffordance = deriveSharePageAffordance({
    pageAccess: presentation.isViewOnly ? "view" : "edit",
    workspaceId: presentation.workspaceId,
    online,
  });

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:grid lg:max-w-[62rem] lg:grid-cols-[minmax(0,48rem)_10rem] lg:gap-4 xl:max-w-[66rem] xl:grid-cols-[minmax(0,48rem)_12rem] xl:gap-6">
      <div className="min-w-0">
        {presentation.displayCoverUrl && (
          <div className="-mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0">
            <PageCover coverUrl={presentation.displayCoverUrl} shareToken={presentation.token} />
          </div>
        )}

        {showBreadcrumbSlot && (
          <div className="mb-6 min-h-6">
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

        <ErrorBoundary key={page.id}>
          <EditorPane
            key={page.id}
            pageId={page.id}
            initialTitle={page.title}
            onTitleChange={handleTitleChange}
            onProvider={setSyncProvider}
            shareToken={presentation.token}
            workspaceId={presentation.workspaceId}
            outline={showOutlineRail ? { kind: "rail", target: outlineRailEl } : { kind: "inline" }}
            affordance={pageAffordance.editor}
            resolveIdentity={resolveIdentity}
          />
        </ErrorBoundary>
      </div>

      {showOutlineRail ? (
        <aside className="pt-[5.5rem]" aria-label="Document outline">
          <div ref={setOutlineRailEl} className="sticky top-8" />
        </aside>
      ) : null}
    </div>
  );
}
