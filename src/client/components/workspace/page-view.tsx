import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Trash2, ChevronRight, Lock, Loader2 } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { api } from "@/client/lib/api";
import { confirm } from "@/client/components/confirm";
import { toast } from "@/client/components/toast";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useCanonicalPageContext } from "@/client/components/workspace/use-canonical-page-context";
import { useAuthStore } from "@/client/stores/auth-store";
import { canArchivePage, canCreatePage, getMyRole } from "@/client/lib/permissions";
import { getArchivePageConfirmMessage } from "@/client/lib/page-archive";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { ErrorBoundary } from "@/client/components/error-boundary";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { AvatarStack } from "@/client/components/presence/avatar-stack";
import { SyncStatusDot } from "@/client/components/presence/sync-status";
import { IconPicker } from "@/client/components/icon-picker";
import { CoverPicker } from "@/client/components/cover-picker";
import { ShareDialog } from "@/client/components/share-dialog";
import { useSyncStatus } from "@/client/hooks/use-sync";
import { useOnline } from "@/client/hooks/use-online";
import { reportClientError } from "@/client/lib/report-client-error";
import type { Page, AncestorInfo } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { CanonicalPageSurface } from "@/client/components/page-surface/canonical";
import { usePageSurface } from "@/client/components/page-surface/use-page-surface";

function Breadcrumbs({
  page,
  workspaceSlug,
  workspaceName,
  pages,
}: {
  page: Page;
  workspaceSlug: string;
  workspaceName?: string | null;
  pages: Page[];
}) {
  const ancestors = useMemo(() => {
    const chain: Page[] = [];
    const byId = new Map(pages.map((p) => [p.id, p]));
    let cur = page.parent_id ? byId.get(page.parent_id) : undefined;
    while (cur && chain.length < 10) {
      chain.push(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return chain.reverse();
  }, [pages, page.parent_id]);

  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />;

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Breadcrumb">
      <Link
        to="/$workspaceSlug"
        params={{ workspaceSlug }}
        className="truncate text-zinc-400 transition-colors hover:text-zinc-300"
      >
        {workspaceName ?? workspaceSlug}
      </Link>
      {ancestors.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          {sep}
          <Link
            to="/$workspaceSlug/$pageId"
            params={{ workspaceSlug, pageId: a.id }}
            className="inline-flex items-center gap-1 truncate text-zinc-400 transition-colors hover:text-zinc-300"
          >
            {a.icon && <EmojiIcon emoji={a.icon} size={12} />}
            {a.title || DEFAULT_PAGE_TITLE}
          </Link>
        </span>
      ))}
      <span className="flex items-center gap-1">
        {sep}
        <span className="inline-flex items-center gap-1 truncate text-zinc-300">
          {page.icon && <EmojiIcon emoji={page.icon} size={12} />}
          {page.title || DEFAULT_PAGE_TITLE}
        </span>
      </span>
    </nav>
  );
}

function SharedBreadcrumbs({
  page,
  workspaceSlug,
  workspaceName,
  ancestors,
}: {
  page: Page;
  workspaceSlug: string;
  workspaceName?: string | null;
  ancestors: AncestorInfo[];
}) {
  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />;

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Breadcrumb">
      <span className="truncate text-zinc-400">{workspaceName ?? workspaceSlug}</span>
      {ancestors.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          {sep}
          {a.accessible ? (
            <Link
              to="/$workspaceSlug/$pageId"
              params={{ workspaceSlug, pageId: a.id }}
              className="inline-flex items-center gap-1 truncate text-zinc-400 transition-colors hover:text-zinc-300"
            >
              {a.icon && <EmojiIcon emoji={a.icon} size={12} />}
              {a.title || DEFAULT_PAGE_TITLE}
            </Link>
          ) : (
            <span className="flex items-center gap-1 text-zinc-500">
              <Lock className="h-2.5 w-2.5" />
              Restricted
            </span>
          )}
        </span>
      ))}
      <span className="flex items-center gap-1">
        {sep}
        <span className="inline-flex items-center gap-1 truncate text-zinc-300">
          {page.icon && <EmojiIcon emoji={page.icon} size={12} />}
          {page.title || DEFAULT_PAGE_TITLE}
        </span>
      </span>
    </nav>
  );
}

export function PageView() {
  const { pageId } = useParams({ strict: false }) as { pageId: string };
  return (
    <CanonicalPageSurface key={pageId}>
      <PageViewContent />
    </CanonicalPageSurface>
  );
}

function PageViewContent() {
  const params = useParams({ strict: false }) as {
    workspaceSlug: string;
    pageId: string;
  };
  const navigate = useNavigate();
  const { state, wsProvider, setWsProvider, patchPage } = usePageSurface();
  const { workspaceId: effectiveWorkspaceId, workspace, pages, members, accessMode } = useCanonicalPageContext();
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);
  const archivePage = useWorkspaceStore((s) => s.archivePageInSnapshot);
  const currentUser = useAuthStore((s) => s.user);
  const role = getMyRole(members, currentUser);
  const isSharedMode = accessMode === "shared";
  const useRestrictedBreadcrumbs = isSharedMode || role === "guest";
  const [isArchiving, setIsArchiving] = useState(false);
  const [outlineRailEl, setOutlineRailEl] = useState<HTMLDivElement | null>(null);
  const iconVersionRef = useRef(0);
  const coverVersionRef = useRef(0);
  const { status } = useSyncStatus(wsProvider);
  const knownHasCover = pages.find((p) => p.id === params.pageId)?.cover_url;
  const online = useOnline();

  const page = state.kind === "ready" ? state.page : null;
  const ancestors = state.kind === "ready" ? state.ancestors : [];

  useDocumentTitle(page?.title || DEFAULT_PAGE_TITLE);

  const directChildCount = useMemo(
    () => (page ? pages.filter((candidate) => candidate.parent_id === page.id && !candidate.archived_at).length : 0),
    [pages, page],
  );

  const handleArchive = useCallback(async () => {
    if (!workspace || !page || isArchiving) return;
    const ok = await confirm({
      title: "Archive page",
      message: getArchivePageConfirmMessage(page.title, directChildCount),
      variant: "danger",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    setIsArchiving(true);
    try {
      await api.pages.delete(workspace.id, page.id);
      archivePage(workspace.id, page.id);
      navigate({
        to: "/$workspaceSlug",
        params: { workspaceSlug: params.workspaceSlug },
      });
    } catch {
      toast.error("Failed to archive page");
      setIsArchiving(false);
    }
  }, [workspace, page, directChildCount, isArchiving, archivePage, navigate, params.workspaceSlug]);

  const handleTitleChange = useCallback(
    (title: string) => {
      if (page && workspace) {
        patchPage({ title });
        updatePage(workspace.id, page.id, { title });
      }
    },
    [page, workspace, updatePage, patchPage],
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      if (!workspace || !page) return;
      const version = ++iconVersionRef.current;
      patchPage({ icon });
      updatePage(workspace.id, page.id, { icon });
      try {
        await api.pages.update(workspace.id, page.id, { icon });
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch (error) {
        if (iconVersionRef.current === version) {
          patchPage({ icon: page.icon });
          updatePage(workspace.id, page.id, { icon: page.icon });
        }
        reportClientError({
          source: "page.icon-update",
          error,
          context: {
            workspaceId: workspace.id,
            pageId: page.id,
            icon,
          },
        });
      }
    },
    [workspace, page, updatePage, wsProvider, patchPage],
  );

  const handleCoverChange = useCallback(
    async (cover_url: string | null) => {
      if (!workspace || !page) return;
      const version = ++coverVersionRef.current;
      patchPage({ cover_url });
      updatePage(workspace.id, page.id, { cover_url });
      try {
        await api.pages.update(workspace.id, page.id, { cover_url });
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch (error) {
        if (coverVersionRef.current === version) {
          patchPage({ cover_url: page.cover_url });
          updatePage(workspace.id, page.id, { cover_url: page.cover_url });
        }
        reportClientError({
          source: "page.cover-update",
          error,
          context: {
            workspaceId: workspace.id,
            pageId: page.id,
            hasCover: !!cover_url,
          },
        });
      }
    },
    [workspace, page, updatePage, wsProvider, patchPage],
  );

  if (state.kind === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8" aria-busy="true">
        {knownHasCover && (
          <div className="-mx-4 -mt-10 mb-6 sm:-mx-8">
            <Skeleton className="h-48 w-full rounded-b-lg" />
          </div>
        )}
        <PageLoadingSkeleton />
      </div>
    );
  }

  if (state.kind === "unavailable" || !page || !effectiveWorkspaceId) {
    return (
      <PageErrorState
        message={state.kind === "unavailable" ? state.message : "Page not found."}
        className="h-full"
        action={{
          label: "Go back",
          onClick: () => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate({
                to: "/$workspaceSlug",
                params: { workspaceSlug: params.workspaceSlug },
              });
            }
          },
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-10 sm:px-8 xl:max-w-[66rem] xl:grid xl:grid-cols-[minmax(0,48rem)_12rem] xl:gap-6">
      <div className="min-w-0">
        {page.cover_url && (
          <div className="group/cover relative -mx-4 -mt-10 mb-6 sm:-mx-8 xl:mx-0">
            <PageCover coverUrl={page.cover_url} />
            {workspace && page.can_edit !== false && online && (
              <div className="absolute right-2 top-2">
                <CoverPicker
                  currentCover={page.cover_url}
                  onSelect={handleCoverChange}
                  workspaceId={workspace.id}
                  pageId={page.id}
                />
              </div>
            )}
          </div>
        )}

        <div className="mb-6 flex min-h-6 items-center justify-between">
          {useRestrictedBreadcrumbs ? (
            <SharedBreadcrumbs
              page={page}
              workspaceSlug={params.workspaceSlug}
              workspaceName={workspace?.name}
              ancestors={ancestors}
            />
          ) : (
            <Breadcrumbs
              page={page}
              workspaceSlug={params.workspaceSlug}
              workspaceName={workspace?.name}
              pages={pages}
            />
          )}
          <div className="flex items-center gap-3">
            {!isSharedMode && workspace && online && canCreatePage(members, currentUser) && (
              <ShareDialog pageId={page.id} />
            )}
            <AvatarStack
              awareness={wsProvider?.awareness ?? null}
              localClientId={wsProvider?.awareness.clientID ?? null}
            />
            <SyncStatusDot status={status} />
          </div>
        </div>

        <div className="group/actions mb-4 flex items-start justify-between pl-7">
          <div className="flex items-center gap-3">
            {workspace && page.can_edit !== false && online ? (
              <>
                <IconPicker currentIcon={page.icon} onSelect={handleIconChange} />
                {!page.cover_url && (
                  <CoverPicker
                    currentCover={null}
                    onSelect={handleCoverChange}
                    workspaceId={workspace.id}
                    pageId={page.id}
                  />
                )}
              </>
            ) : (
              page.icon && <EmojiIcon emoji={page.icon} size={28} />
            )}
          </div>
          {!isSharedMode && workspace && canArchivePage(members, currentUser, page) && (
            <button
              onClick={handleArchive}
              disabled={isArchiving || !online}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 opacity-40 transition-[colors,opacity] hover:bg-red-500/10 hover:text-red-400 group-hover/actions:opacity-100 disabled:opacity-50"
              aria-label={online ? "Archive page" : "Archive page (offline)"}
            >
              {isArchiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Archive
            </button>
          )}
        </div>

        <ErrorBoundary key={page.id}>
          <EditorPane
            pageId={page.id}
            initialTitle={page.title}
            onTitleChange={handleTitleChange}
            onProvider={setWsProvider}
            readOnly={page.can_edit === false}
            workspaceId={effectiveWorkspaceId}
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
