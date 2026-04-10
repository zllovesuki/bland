import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Share2, FileText, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import type { SharedWithMeItem } from "@/shared/types";

type ViewState = "loading" | "loaded" | "error";

function groupByWorkspace(items: SharedWithMeItem[]) {
  const groups: Map<string, { workspace: SharedWithMeItem["workspace"]; pages: SharedWithMeItem[] }> = new Map();
  for (const item of items) {
    let group = groups.get(item.workspace.id);
    if (!group) {
      group = { workspace: item.workspace, pages: [] };
      groups.set(item.workspace.id, group);
    }
    group.pages.push(item);
  }
  return [...groups.values()];
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Today";
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return date.toLocaleDateString();
}

export function SharedWithMeView() {
  useDocumentTitle("Shared with me");
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const cachedInbox = useWorkspaceStore((s) => s.sharedInbox);
  const setSharedInbox = useWorkspaceStore((s) => s.setSharedInbox);
  const memberWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const [items, setItems] = useState<SharedWithMeItem[]>(cachedInbox);
  const [viewState, setViewState] = useState<ViewState>(cachedInbox.length > 0 ? "loaded" : "loading");

  useEffect(() => {
    if (!isAuthenticated) {
      if (cachedInbox.length > 0) {
        setItems(cachedInbox);
        setViewState("loaded");
      } else {
        setViewState("error");
      }
      return;
    }
    let cancelled = false;

    api.shares
      .sharedWithMe()
      .then((result) => {
        if (cancelled) return;
        setItems(result);
        setSharedInbox(result);
        setViewState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        if (cachedInbox.length > 0) {
          setItems(cachedInbox);
          setViewState("loaded");
        } else {
          setViewState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setSharedInbox, cachedInbox.length]);

  const handlePageClick = useCallback(
    (item: SharedWithMeItem) => {
      // Seed workspace context so the page route can bootstrap without a live fetch
      // (enables offline navigation from cached inbox)
      const store = useWorkspaceStore.getState();
      store.setCurrentWorkspace({
        id: item.workspace.id,
        name: item.workspace.name,
        slug: item.workspace.slug,
        icon: item.workspace.icon,
        owner_id: "",
        created_at: "",
      });
      store.setAccessMode("shared");

      // Seed a minimal page record so page-view's offline fallback can find it.
      // Keep only pages for the target workspace to preserve the single-workspace invariant.
      const existing = store.pages.filter((p) => p.workspace_id === item.workspace.id);
      if (!existing.some((p) => p.id === item.page_id)) {
        existing.push({
          id: item.page_id,
          workspace_id: item.workspace.id,
          parent_id: null,
          title: item.title,
          icon: item.icon,
          cover_url: item.cover_url,
          position: 0,
          created_by: "",
          created_at: item.shared_at,
          updated_at: item.shared_at,
          archived_at: null,
        });
      }
      store.setPages(existing);

      navigate({
        to: "/$workspaceSlug/$pageId",
        params: { workspaceSlug: item.workspace.slug, pageId: item.page_id },
      });
    },
    [navigate],
  );

  if (viewState === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-slide-up text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-zinc-500" />
          <p className="text-sm text-zinc-400">Loading shared pages...</p>
        </div>
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="animate-slide-up text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h2 className="text-lg font-semibold text-zinc-200">Couldn't load shared pages</h2>
          <p className="mt-1 text-sm text-zinc-500">Check your connection and try again.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-slide-up text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50">
            <Share2 className="h-8 w-8 text-zinc-600" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-200">No pages shared with you yet</h2>
          <p className="mt-1 text-sm text-zinc-500">When someone shares a page with you, it will appear here.</p>
        </div>
      </div>
    );
  }

  const groups = groupByWorkspace(items);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="animate-slide-up">
        <div className="mb-6 flex items-center gap-3">
          {memberWorkspaces.length > 0 && (
            <Link
              to="/"
              className="flex items-center justify-center rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Back to workspaces"
              title="Back to workspaces"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Share2 className="h-5 w-5 text-zinc-400" />
          <h1 className="text-lg font-semibold text-zinc-200">Shared with me</h1>
        </div>

        <div className="space-y-6">
          {groups.map(({ workspace, pages }) => (
            <div key={workspace.id}>
              <div className="mb-2 flex items-center gap-2 px-1">
                {workspace.icon ? (
                  <EmojiIcon emoji={workspace.icon} size={14} />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-zinc-700 text-[10px] font-medium text-zinc-400">
                    {workspace.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="text-xs font-medium text-zinc-400">{workspace.name}</span>
              </div>

              <div className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800/60 bg-zinc-900/50">
                {pages.map((item) => (
                  <button
                    key={item.page_id}
                    onClick={() => handlePageClick(item)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/50"
                  >
                    <span className="shrink-0 text-base">
                      {item.icon ?? <FileText className="h-4 w-4 text-zinc-500" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-200">
                        {item.title || DEFAULT_PAGE_TITLE}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span>{item.shared_by_name}</span>
                        <span>·</span>
                        <span>{formatRelativeDate(item.shared_at)}</span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        item.permission === "edit" ? "bg-accent-500/10 text-accent-400" : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {item.permission === "edit" ? "Edit" : "View"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
