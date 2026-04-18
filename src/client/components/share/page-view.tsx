import { useCallback, useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { ErrorBoundary } from "@/client/components/error-boundary";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
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
import type { PageAncestor } from "@/shared/types";

function SharedBreadcrumbs({
  ancestors,
  currentTitle,
  currentIcon,
  onNavigate,
}: {
  ancestors: PageAncestor[];
  currentTitle: string;
  currentIcon: string | null;
  onNavigate: (pageId: string) => void;
}) {
  if (ancestors.length === 0) return null;

  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />;

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Breadcrumb">
      {ancestors.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          {a.accessible ? (
            <button
              onClick={() => onNavigate(a.id)}
              className="inline-flex items-center gap-1 truncate text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {a.icon && <EmojiIcon emoji={a.icon} size={12} />}
              {a.title || DEFAULT_PAGE_TITLE}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-zinc-500">
              <Lock className="h-2.5 w-2.5" />
              Restricted
            </span>
          )}
          {sep}
        </span>
      ))}
      <span className="inline-flex items-center gap-1 truncate text-zinc-300">
        {currentIcon && <EmojiIcon emoji={currentIcon} size={12} />}
        {currentTitle || DEFAULT_PAGE_TITLE}
      </span>
    </nav>
  );
}

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
  const handleTitleChange = useCallback(
    (titleOverride: string) => {
      patchPage({ title: titleOverride });
      if (presentation.isRootActive) {
        presentation.patchRootPage({ title: titleOverride });
      }
    },
    [patchPage, presentation.isRootActive, presentation.patchRootPage],
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
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8" aria-busy="true">
        <PageLoadingSkeleton />
      </div>
    );
  }

  const page = presentation.page;
  const showBreadcrumbSlot = presentation.isAncestorTrailLoading || presentation.ancestors.length > 0;
  const pageAffordance = deriveSharePageAffordance({
    pageAccess: presentation.isViewOnly ? "view" : "edit",
    workspaceId: presentation.workspaceId,
    online,
  });

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-10 sm:px-8 xl:max-w-[66rem] xl:grid xl:grid-cols-[minmax(0,48rem)_12rem] xl:gap-6">
      <div className="min-w-0">
        {presentation.displayCoverUrl && (
          <div className="-mx-4 -mt-10 mb-6 sm:-mx-8 xl:mx-0">
            <PageCover coverUrl={presentation.displayCoverUrl} shareToken={presentation.token} />
          </div>
        )}

        {showBreadcrumbSlot && (
          <div className="mb-6 min-h-6">
            {presentation.isAncestorTrailLoading ? (
              <SharedBreadcrumbSkeleton />
            ) : (
              <SharedBreadcrumbs
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
            affordance={pageAffordance.editor}
            outlinePortalTarget={outlineRailEl}
          />
        </ErrorBoundary>
      </div>

      <aside className="hidden pt-[5.5rem] xl:block" aria-label="Document outline">
        <div ref={setOutlineRailEl} className="sticky top-8" />
      </aside>
    </div>
  );
}
