import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, AlertCircle, Eye, ChevronRight, Lock } from "lucide-react";
import { api, toApiError } from "@/client/lib/api";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { SharedPageTree } from "@/client/components/shared-page-tree";
import type { SharedPageInfo, AncestorInfo } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";

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

  const sep = <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />;

  return (
    <nav className="flex items-center gap-1 text-xs" aria-label="Breadcrumb">
      {ancestors.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          {a.accessible ? (
            <button onClick={() => onNavigate(a.id)} className="truncate text-zinc-500 transition hover:text-zinc-300">
              {a.icon ? `${a.icon} ` : ""}
              {a.title || DEFAULT_PAGE_TITLE}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-zinc-600">
              <Lock className="h-2.5 w-2.5" />
              Restricted
            </span>
          )}
          {sep}
        </span>
      ))}
      <span className="truncate text-zinc-300">
        {currentIcon ? `${currentIcon} ` : ""}
        {currentTitle || DEFAULT_PAGE_TITLE}
      </span>
    </nav>
  );
}

export function SharedPageView({ token, activePage }: { token: string; activePage?: string }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<SharedPageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [ancestors, setAncestors] = useState<AncestorInfo[]>([]);

  // The page currently being viewed: either ?page= param or the root shared page
  const currentPageId = activePage ?? info?.page_id;

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.shares.resolve(token);
        if (!cancelled) {
          setInfo(data);
          if (!activePage) setTitle(data.title);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toApiError(err).message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [token, activePage]);

  // Load ancestors for the current page
  useEffect(() => {
    if (!info || !currentPageId) return;
    let cancelled = false;

    api.pages
      .ancestors(info.workspace_id, currentPageId, token)
      .then((data) => {
        if (!cancelled) setAncestors(data);
      })
      .catch(() => {
        if (!cancelled) setAncestors([]);
      });

    return () => {
      cancelled = true;
    };
  }, [info, currentPageId, token]);

  // Load title for child pages
  useEffect(() => {
    if (!info || !activePage) return;
    let cancelled = false;

    // Fetch children of root to find the active page's title
    api.pages
      .children(info.workspace_id, info.page_id, token)
      .then((pages) => {
        if (cancelled) return;
        // The active page might be a deeper child — walk the tree
        const match = pages.find((p) => p.id === activePage);
        if (match) {
          setTitle(match.title);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [info, activePage, token]);

  const handleNavigate = useCallback(
    (pageId: string) => {
      if (!info) return;
      const page = pageId === info.page_id ? undefined : pageId;
      navigate({ to: "/s/$token", params: { token }, search: { page } });
    },
    [info, token, navigate],
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090b]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#09090b]">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm text-zinc-400">{error ?? "This shared link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  const isViewOnly = info.permission === "view";
  const displayPageId = currentPageId ?? info.page_id;

  return (
    <div className="flex h-screen flex-col bg-[#09090b]">
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center px-8 py-3">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="inline-grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 shadow-sm shadow-accent-500/10">
              <FileText className="h-5 w-5 text-white" />
            </div>
          </Link>

          <span className="ml-4 truncate text-sm text-zinc-400">
            {info.icon ? `${info.icon} ` : ""}
            {title || DEFAULT_PAGE_TITLE}
          </span>

          <div className="flex-1" />

          {isViewOnly && (
            <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              <Eye className="h-3 w-3" />
              View only
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SharedPageTree
          workspaceId={info.workspace_id}
          rootPageId={info.page_id}
          rootTitle={info.title}
          rootIcon={info.icon}
          shareToken={token}
          activePageId={displayPageId}
          onNavigate={handleNavigate}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-10">
            {info.cover_url && !activePage && (
              <div className="-mx-8 -mt-10 mb-6">
                <div className="h-48 overflow-hidden rounded-b-lg">
                  {info.cover_url.startsWith("linear-gradient") ? (
                    <div className="h-full w-full" style={{ background: info.cover_url }} />
                  ) : (
                    <img
                      src={info.cover_url.startsWith("/uploads/") ? `${info.cover_url}?share=${token}` : info.cover_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              </div>
            )}

            {ancestors.length > 0 && (
              <div className="mb-4">
                <SharedBreadcrumbs
                  ancestors={ancestors}
                  currentTitle={title}
                  currentIcon={info.icon}
                  onNavigate={handleNavigate}
                />
              </div>
            )}

            {info.icon && !activePage && <div className="mb-2 pl-7 text-4xl">{info.icon}</div>}

            <EditorPane
              key={displayPageId}
              pageId={displayPageId}
              initialTitle={activePage ? title : info.title}
              onTitleChange={setTitle}
              shareToken={token}
              readOnly={isViewOnly}
              workspaceId={info.workspace_id}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
