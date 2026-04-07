import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Trash2, ChevronRight, Lock, Loader2 } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import type YProvider from "y-partyserver/provider";
import { api, toApiError } from "@/client/lib/api";
import { confirm } from "@/client/components/confirm";
import { toast } from "@/client/components/toast";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
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
import type { Page, AncestorInfo } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { parseDocMessage } from "@/shared/doc-messages";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useMyRole } from "@/client/hooks/use-role";

function Breadcrumbs({ page, workspaceSlug }: { page: Page; workspaceSlug: string }) {
  const workspace = useWorkspaceStore((s) => s.currentWorkspace);
  const pages = useWorkspaceStore((s) => s.pages);

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

  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />;

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Breadcrumb">
      <Link
        to="/$workspaceSlug"
        params={{ workspaceSlug }}
        className="truncate text-zinc-500 transition-colors hover:text-zinc-300"
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
  const workspace = useWorkspaceStore((s) => s.currentWorkspace);
  const [ancestors, setAncestors] = useState<AncestorInfo[]>([]);

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    api.pages
      .ancestors(workspace.id, page.id)
      .then((a) => {
        if (!cancelled) setAncestors(a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspace, page.id]);

  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />;

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Breadcrumb">
      <span className="truncate text-zinc-500">{workspace?.name ?? workspaceSlug}</span>
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
            <span className="flex items-center gap-1 text-zinc-600">
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
  const params = useParams({ strict: false }) as {
    workspaceSlug: string;
    pageId: string;
  };
  const navigate = useNavigate();
  const workspace = useWorkspaceStore((s) => s.currentWorkspace);
  const pages = useWorkspaceStore((s) => s.pages);
  const updatePage = useWorkspaceStore((s) => s.updatePage);
  const addPage = useWorkspaceStore((s) => s.addPage);
  const archivePage = useWorkspaceStore((s) => s.archivePage);
  const members = useWorkspaceStore((s) => s.members);
  const accessMode = useWorkspaceStore((s) => s.accessMode);
  const isSharedMode = accessMode === "shared";
  const { role } = useMyRole();
  const useRestrictedBreadcrumbs = isSharedMode || role === "guest";
  const currentUser = useAuthStore((s) => s.user);
  const [page, setPage] = useState<(Page & { can_edit?: boolean }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [wsProvider, setWsProvider] = useState<YProvider | null>(null);
  const iconVersionRef = useRef(0);
  const coverVersionRef = useRef(0);
  const { status } = useSyncStatus(wsProvider);
  const knownHasCover = useWorkspaceStore((s) => s.pages.find((p) => p.id === params.pageId)?.cover_url);
  const online = useOnline();
  useDocumentTitle(page?.title || DEFAULT_PAGE_TITLE);
  const directChildCount = useMemo(
    () => (page ? pages.filter((candidate) => candidate.parent_id === page.id && !candidate.archived_at).length : 0),
    [pages, page],
  );

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;

    async function loadPage() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.pages.get(workspace!.id, params.pageId);
        if (!cancelled) {
          setPage(data);
          const exists = useWorkspaceStore.getState().pages.some((p) => p.id === data.id);
          if (exists) updatePage(data.id, data);
          else addPage(data);
        }
      } catch (err) {
        if (!cancelled) {
          // Offline: fall back to cached page from workspace store
          if (!online) {
            const cached = useWorkspaceStore.getState().pages.find((p) => p.id === params.pageId);
            if (cached) {
              setPage(cached);
              setIsLoading(false);
              return;
            }
          }
          setError(toApiError(err).message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [workspace, params.pageId, updatePage]);

  const handleArchive = useCallback(async () => {
    if (!workspace || !page || isArchiving) return;
    const ok = await confirm({
      title: "Archive page",
      message: getArchivePageConfirmMessage(page.title, directChildCount),
    });
    if (!ok) return;
    setIsArchiving(true);
    try {
      await api.pages.delete(workspace.id, page.id);
      archivePage(page.id);
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
      if (page) {
        setPage({ ...page, title });
        updatePage(page.id, { title });
      }
    },
    [page, updatePage],
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      if (!workspace || !page) return;
      const version = ++iconVersionRef.current;
      setPage((p) => (p ? { ...p, icon } : p));
      updatePage(page.id, { icon });
      try {
        await api.pages.update(workspace.id, page.id, { icon });
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch {
        if (iconVersionRef.current === version) {
          setPage((p) => (p ? { ...p, icon: page.icon } : p));
          updatePage(page.id, { icon: page.icon });
        }
      }
    },
    [workspace, page, updatePage, wsProvider],
  );

  const handleCoverChange = useCallback(
    async (cover_url: string | null) => {
      if (!workspace || !page) return;
      const version = ++coverVersionRef.current;
      setPage((p) => (p ? { ...p, cover_url } : p));
      updatePage(page.id, { cover_url });
      try {
        await api.pages.update(workspace.id, page.id, { cover_url });
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch {
        if (coverVersionRef.current === version) {
          setPage((p) => (p ? { ...p, cover_url: page.cover_url } : p));
          updatePage(page.id, { cover_url: page.cover_url });
        }
      }
    },
    [workspace, page, updatePage, wsProvider],
  );

  // Listen for real-time icon/cover updates from other clients
  useEffect(() => {
    if (!wsProvider) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        setPage((p) => (p ? { ...p, icon: msg.icon, cover_url: msg.cover_url } : p));
        updatePage(msg.pageId, { icon: msg.icon, cover_url: msg.cover_url });
      }
    };
    wsProvider.on("custom-message", handler);
    return () => wsProvider.off("custom-message", handler);
  }, [wsProvider, updatePage]);

  if (isLoading || !workspace) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
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
    return <PageErrorState message={error ?? "Page not found."} className="h-full" />;
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-10 sm:px-8">
      {page.cover_url && (
        <div className="group/cover relative -mx-4 -mt-10 mb-6 sm:-mx-8">
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

      <div className="mb-4 flex min-h-6 items-center justify-between">
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

      <div className="group/actions mb-2 flex items-start justify-between pl-7">
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 opacity-0 transition-colors hover:bg-red-500/10 hover:text-red-400 group-hover/actions:opacity-100 disabled:opacity-50"
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
        />
      </ErrorBoundary>
    </div>
  );
}
