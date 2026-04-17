import { useState } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { ErrorBoundary } from "@/client/components/error-boundary";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useShareView } from "@/client/components/share/use-share-view";
import { useOptionalPageSurface } from "@/client/components/page-surface/use-page-surface";
import type { AncestorInfo } from "@/shared/types";

function SharedBreadcrumbs({
  ancestors,
  currentTitle,
  currentIcon,
  onNavigate,
}: {
  ancestors: AncestorInfo[];
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

export function SharePageView() {
  const { status, info, error, displayPageId, setWsProvider, handleNavigate, handleTitleChange } = useShareView();
  const surface = useOptionalPageSurface();
  const state = surface?.state;

  const readyPage = state?.kind === "ready" ? state.page : null;
  const ancestors = state?.kind === "ready" ? state.ancestors : [];
  const title = readyPage?.title ?? "";
  const icon = readyPage?.icon ?? null;
  const coverUrl = readyPage?.cover_url ?? null;
  const isViewOnly = readyPage ? readyPage.can_edit === false : true;

  const [outlineRailEl, setOutlineRailEl] = useState<HTMLDivElement | null>(null);
  useDocumentTitle(title || DEFAULT_PAGE_TITLE);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10" aria-busy="true">
        <PageLoadingSkeleton />
      </div>
    );
  }

  if (error || !info) {
    return (
      <PageErrorState
        message={error ?? "This shared link is invalid or has expired."}
        className="h-full"
        action={{
          label: "Go home",
          onClick: () => {
            window.location.href = "/";
          },
        }}
      />
    );
  }

  if (state?.kind === "unavailable") {
    return (
      <PageErrorState
        message={state.message}
        className="h-full"
        action={{
          label: "Back to shared page",
          onClick: () => handleNavigate(info.page_id),
        }}
      />
    );
  }

  const effectivePageId = displayPageId ?? info.page_id;
  const isPageLoading = !state || state.kind === "loading";
  const activePage = displayPageId !== info.page_id ? displayPageId : undefined;

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-10 sm:px-8 xl:max-w-[66rem] xl:grid xl:grid-cols-[minmax(0,48rem)_12rem] xl:gap-6">
      <div className="min-w-0">
        {isPageLoading && (
          <div className="py-10" aria-busy="true">
            <PageLoadingSkeleton />
          </div>
        )}

        {!isPageLoading && coverUrl && (
          <div className="-mx-4 -mt-10 mb-6 sm:-mx-8 xl:mx-0">
            <PageCover coverUrl={coverUrl} shareToken={info.token} />
          </div>
        )}

        {!isPageLoading && ancestors.length > 0 && (
          <div className="mb-6">
            <SharedBreadcrumbs
              ancestors={ancestors}
              currentTitle={title}
              currentIcon={icon}
              onNavigate={handleNavigate}
            />
          </div>
        )}

        {!isPageLoading && icon && (
          <div className="mb-4 pl-7">
            <EmojiIcon emoji={icon} size={28} />
          </div>
        )}

        {/* Hide the editor container during the loading pass to avoid layout
            jump while the skeleton renders above. Sub-page navigation still
            remounts the editor because effectivePageId keys this boundary and
            the EditorPane itself. */}
        <ErrorBoundary key={effectivePageId}>
          {/* don't hide the mounted editor with display: none and
            use a layout-preserving hidden state for title height stability */}
          <div
            className={isPageLoading ? "invisible h-0 overflow-hidden" : undefined}
            aria-hidden={isPageLoading || undefined}
          >
            <EditorPane
              key={effectivePageId}
              pageId={effectivePageId}
              initialTitle={activePage ? title : info.title}
              onTitleChange={handleTitleChange}
              onProvider={setWsProvider}
              shareToken={info.token}
              readOnly={isViewOnly}
              workspaceId={info.workspace_id}
              outlinePortalTarget={isPageLoading ? null : outlineRailEl}
            />
          </div>
        </ErrorBoundary>
      </div>

      <aside className="hidden pt-[5.5rem] xl:block" aria-label="Document outline">
        <div ref={setOutlineRailEl} className={isPageLoading ? "sticky top-8 invisible" : "sticky top-8"} />
      </aside>
    </div>
  );
}
