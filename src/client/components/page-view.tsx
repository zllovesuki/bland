import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Loader2, AlertCircle, Trash2, ChevronRight } from "lucide-react";
import type YProvider from "y-partyserver/provider";
import { api, toApiError } from "@/client/lib/api";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { canArchivePage } from "@/client/lib/permissions";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { AvatarStack } from "@/client/components/presence/avatar-stack";
import { SyncStatusDot } from "@/client/components/presence/sync-status";
import { useSyncStatus } from "@/client/hooks/use-sync";
import type { Page } from "@/shared/types";

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
        className="truncate text-zinc-500 transition hover:text-zinc-300"
      >
        {workspace?.name ?? workspaceSlug}
      </Link>
      {ancestors.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          {sep}
          <Link
            to="/$workspaceSlug/$pageId"
            params={{ workspaceSlug, pageId: a.id }}
            className="truncate text-zinc-400 transition hover:text-zinc-300"
          >
            {a.icon ? `${a.icon} ` : ""}
            {a.title || "Untitled"}
          </Link>
        </span>
      ))}
      <span className="flex items-center gap-1">
        {sep}
        <span className="truncate text-zinc-300">
          {page.icon ? `${page.icon} ` : ""}
          {page.title || "Untitled"}
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
  const updatePage = useWorkspaceStore((s) => s.updatePage);
  const archivePage = useWorkspaceStore((s) => s.archivePage);
  const members = useWorkspaceStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.user);
  const [page, setPage] = useState<Page | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [wsProvider, setWsProvider] = useState<YProvider | null>(null);
  const { status } = useSyncStatus(wsProvider);

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
          updatePage(data.id, data);
        }
      } catch (err) {
        if (!cancelled) {
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
    setIsArchiving(true);
    try {
      await api.pages.delete(workspace.id, page.id);
      archivePage(page.id);
      navigate({
        to: "/$workspaceSlug",
        params: { workspaceSlug: params.workspaceSlug },
      });
    } catch {
      setIsArchiving(false);
    }
  }, [workspace, page, isArchiving, archivePage, navigate, params.workspaceSlug]);

  const handleTitleChange = useCallback(
    (title: string) => {
      if (page) {
        setPage({ ...page, title });
        updatePage(page.id, { title });
      }
    },
    [page, updatePage],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm text-zinc-400">{error ?? "Page not found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-8 py-10">
      <div className="mb-4 flex min-h-6 items-center justify-between">
        <Breadcrumbs page={page} workspaceSlug={params.workspaceSlug} />
        <div className="flex items-center gap-3">
          <AvatarStack
            awareness={wsProvider?.awareness ?? null}
            localClientId={wsProvider?.awareness.clientID ?? null}
          />
          <SyncStatusDot status={status} />
        </div>
      </div>

      {page.cover_url && (
        <div className="-mx-8 -mt-10 mb-8 h-48 overflow-hidden">
          <img src={page.cover_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="group/actions mb-2 flex items-start justify-between pl-7">
        {page.icon && <span className="text-4xl">{page.icon}</span>}
        {(() => {
          return canArchivePage(members, currentUser, page) ? (
            <button
              onClick={handleArchive}
              disabled={isArchiving}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover/actions:opacity-100 disabled:opacity-50"
              title="Archive page"
            >
              {isArchiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Archive
            </button>
          ) : null;
        })()}
      </div>

      <EditorPane
        key={page.id}
        pageId={page.id}
        initialTitle={page.title}
        onTitleChange={handleTitleChange}
        onProvider={setWsProvider}
      />
    </div>
  );
}
