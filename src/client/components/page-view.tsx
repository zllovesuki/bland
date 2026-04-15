import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Trash2, ChevronRight, Lock, Loader2 } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import type YProvider from "y-partyserver/provider";
import { api, toApiError } from "@/client/lib/api";
import { applyResolvedRoute, resolvePageRoute } from "@/client/lib/workspace-data";
import { confirm } from "@/client/components/confirm";
import { toast } from "@/client/components/toast";
import { getCachedDocKey, SESSION_MODES } from "@/client/lib/constants";
import {
  useWorkspaceStore,
  selectActiveWorkspace,
  selectActivePages,
  selectActiveMembers,
} from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { canArchivePage, canCreatePage } from "@/client/lib/permissions";
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
import { isDocCached, removeDocHint } from "@/client/lib/doc-cache-hints";
import { reportClientError } from "@/client/lib/report-client-error";
import type { Page, AncestorInfo } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { parseDocMessage } from "@/shared/doc-messages";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useMyRole } from "@/client/hooks/use-role";

function Breadcrumbs({ page, workspaceSlug }: { page: Page; workspaceSlug: string }) {
  const workspace = useWorkspaceStore(selectActiveWorkspace);
  const pages = useWorkspaceStore(selectActivePages);

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
        {workspace?.name ?? workspaceSlug}
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

function SharedBreadcrumbs({ page, workspaceSlug }: { page: Page; workspaceSlug: string }) {
  const workspace = useWorkspaceStore(selectActiveWorkspace);
  const [ancestors, setAncestors] = useState<AncestorInfo[]>([]);
  const workspaceId = workspace?.id;

  useEffect(() => {
    if (!workspaceId) {
      setAncestors([]);
      return;
    }
    let cancelled = false;
    api.pages
      .ancestors(workspaceId, page.id)
      .then((a) => {
        if (!cancelled) setAncestors(a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId, page.id]);

  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />;

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Breadcrumb">
      <span className="truncate text-zinc-400">{workspace?.name ?? workspaceSlug}</span>
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
  return <PageViewContent key={pageId} />;
}

function PageViewContent() {
  const params = useParams({ strict: false }) as {
    workspaceSlug: string;
    pageId: string;
  };
  const navigate = useNavigate();
  const workspace = useWorkspaceStore(selectActiveWorkspace);
  const pages = useWorkspaceStore(selectActivePages);
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);
  const addPage = useWorkspaceStore((s) => s.addPageToSnapshot);
  const archivePage = useWorkspaceStore((s) => s.archivePageInSnapshot);
  const members = useWorkspaceStore(selectActiveMembers);
  const accessMode = useWorkspaceStore((s) => s.activeAccessMode);
  const routeSource = useWorkspaceStore((s) => s.activeRouteSource);
  const isSharedMode = accessMode === "shared";
  const { role } = useMyRole();
  const useRestrictedBreadcrumbs = isSharedMode || role === "guest";
  const currentUser = useAuthStore((s) => s.user);
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const [page, setPage] = useState<(Page & { can_edit?: boolean }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [wsProvider, setWsProvider] = useState<YProvider | null>(null);
  const [outlineRailEl, setOutlineRailEl] = useState<HTMLDivElement | null>(null);
  const iconVersionRef = useRef(0);
  const coverVersionRef = useRef(0);
  const { status } = useSyncStatus(wsProvider);
  const knownHasCover = pages.find((p) => p.id === params.pageId)?.cover_url;
  const online = useOnline();
  useDocumentTitle(page?.title || DEFAULT_PAGE_TITLE);
  const directChildCount = useMemo(
    () => (page ? pages.filter((candidate) => candidate.parent_id === page.id && !candidate.archived_at).length : 0),
    [pages, page],
  );

  const workspaceId = workspace?.id;
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    async function loadPage() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.pages.get(workspaceId!, params.pageId);
        if (!cancelled) {
          setPage(data);
          const snap = useWorkspaceStore.getState().snapshotsByWorkspaceId[workspaceId!];
          if (snap) {
            const exists = snap.pages.some((p) => p.id === data.id);
            if (exists) updatePage(workspaceId!, data.id, data);
            else addPage(workspaceId!, data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const apiErr = toApiError(err);

          // Confirmed 403: remove from cache + clear Yjs DB (spec 20.3)
          if (apiErr.error === "forbidden" || apiErr.message.includes("403")) {
            useWorkspaceStore.getState().removePageFromSnapshot(workspaceId!, params.pageId);
            removeDocHint(params.pageId);
            import("y-indexeddb").then((m) => m.clearDocument(getCachedDocKey(params.pageId))).catch(() => {});
            setError("You no longer have access to this page.");
            setIsLoading(false);
            return;
          }

          // Offline/expired: try pageMetaById for cross-workspace recovery
          const currentMode = useAuthStore.getState().sessionMode;
          if (!online || currentMode !== SESSION_MODES.AUTHENTICATED) {
            const cached = useWorkspaceStore.getState().pageMetaById[params.pageId];
            if (cached) {
              if (isDocCached(params.pageId)) {
                setPage(cached);
              } else {
                setError("This page isn't available offline yet.");
              }
              setIsLoading(false);
              return;
            }
          }
          reportClientError({
            source: "page.load",
            error: err,
            context: {
              workspaceId,
              pageId: params.pageId,
              online,
              sessionMode: currentMode,
            },
          });
          setError(apiErr.message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, params.pageId, updatePage, addPage]);

  useEffect(() => {
    if (!online || sessionMode !== SESSION_MODES.AUTHENTICATED || routeSource !== "cache") return;

    let cancelled = false;

    async function revalidateRoute() {
      const store = useWorkspaceStore.getState();
      const result = await resolvePageRoute(params.workspaceSlug, params.pageId, store);
      if (cancelled || result.kind !== "resolved") return;

      applyResolvedRoute(useWorkspaceStore.getState(), result);

      if (result.data.canonicalSlug) {
        navigate({
          to: "/$workspaceSlug/$pageId",
          params: { workspaceSlug: result.data.canonicalSlug, pageId: params.pageId },
          replace: true,
        });
      }
    }

    void revalidateRoute();
    return () => {
      cancelled = true;
    };
  }, [navigate, online, params.pageId, params.workspaceSlug, routeSource, sessionMode]);

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
        setPage({ ...page, title });
        updatePage(workspace.id, page.id, { title });
      }
    },
    [page, workspace, updatePage],
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      if (!workspace || !page) return;
      const version = ++iconVersionRef.current;
      setPage((p) => (p ? { ...p, icon } : p));
      updatePage(workspace.id, page.id, { icon });
      try {
        await api.pages.update(workspace.id, page.id, { icon });
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch (error) {
        if (iconVersionRef.current === version) {
          setPage((p) => (p ? { ...p, icon: page.icon } : p));
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
    [workspace, page, updatePage, wsProvider],
  );

  const handleCoverChange = useCallback(
    async (cover_url: string | null) => {
      if (!workspace || !page) return;
      const version = ++coverVersionRef.current;
      setPage((p) => (p ? { ...p, cover_url } : p));
      updatePage(workspace.id, page.id, { cover_url });
      try {
        await api.pages.update(workspace.id, page.id, { cover_url });
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch (error) {
        if (coverVersionRef.current === version) {
          setPage((p) => (p ? { ...p, cover_url: page.cover_url } : p));
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
    [workspace, page, updatePage, wsProvider],
  );

  // Listen for real-time icon/cover updates from other clients
  useEffect(() => {
    if (!wsProvider || !workspace) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        setPage((p) => (p ? { ...p, icon: msg.icon, cover_url: msg.cover_url } : p));
        updatePage(workspace.id, msg.pageId, { icon: msg.icon, cover_url: msg.cover_url });
      }
    };
    wsProvider.on("custom-message", handler);
    return () => wsProvider.off("custom-message", handler);
  }, [wsProvider, workspace, updatePage]);

  if (isLoading || !workspace) {
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

  if (error || !page) {
    return (
      <PageErrorState
        message={error ?? "Page not found."}
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
            {page.can_edit !== false && online && (
              <div className="absolute right-2 top-2">
                <CoverPicker
                  currentCover={page.cover_url}
                  onSelect={handleCoverChange}
                  workspaceId={workspace!.id}
                  pageId={page.id}
                />
              </div>
            )}
          </div>
        )}

        <div className="mb-6 flex min-h-6 items-center justify-between">
          {useRestrictedBreadcrumbs ? (
            <SharedBreadcrumbs page={page} workspaceSlug={params.workspaceSlug} />
          ) : (
            <Breadcrumbs page={page} workspaceSlug={params.workspaceSlug} />
          )}
          <div className="flex items-center gap-3">
            {!isSharedMode && online && canCreatePage(members, currentUser) && <ShareDialog pageId={page.id} />}
            <AvatarStack
              awareness={wsProvider?.awareness ?? null}
              localClientId={wsProvider?.awareness.clientID ?? null}
            />
            <SyncStatusDot status={status} />
          </div>
        </div>

        <div className="group/actions mb-4 flex items-start justify-between pl-7">
          <div className="flex items-center gap-3">
            {page.can_edit !== false && online ? (
              <>
                <IconPicker currentIcon={page.icon} onSelect={handleIconChange} />
                {!page.cover_url && (
                  <CoverPicker
                    currentCover={null}
                    onSelect={handleCoverChange}
                    workspaceId={workspace!.id}
                    pageId={page.id}
                  />
                )}
              </>
            ) : (
              page.icon && <EmojiIcon emoji={page.icon} size={28} />
            )}
          </div>
          {!isSharedMode && canArchivePage(members, currentUser, page) && (
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
            workspaceId={workspace.id}
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
