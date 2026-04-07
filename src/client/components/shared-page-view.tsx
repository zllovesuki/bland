import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, Eye, ChevronRight, Lock, Menu } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import type YProvider from "y-partyserver/provider";
import { api, toApiError } from "@/client/lib/api";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { Footer } from "@/client/components/footer";
import { SharedPageTree } from "@/client/components/shared-page-tree";
import type { SharedPageInfo, AncestorInfo } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { parseDocMessage } from "@/shared/doc-messages";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { MobileDrawer } from "@/client/components/ui/mobile-drawer";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { useDocumentTitle } from "@/client/hooks/use-document-title";

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
            <button
              onClick={() => onNavigate(a.id)}
              className="inline-flex items-center gap-1 truncate text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {a.icon && <EmojiIcon emoji={a.icon} size={12} />}
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
      <span className="inline-flex items-center gap-1 truncate text-zinc-300">
        {currentIcon && <EmojiIcon emoji={currentIcon} size={12} />}
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
  const [icon, setIcon] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [ancestors, setAncestors] = useState<AncestorInfo[]>([]);
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [wsProvider, setWsProvider] = useState<YProvider | null>(null);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  useDocumentTitle(title || DEFAULT_PAGE_TITLE);

  // The page currently being viewed: either ?page= param or the root shared page
  const currentPageId = activePage ?? info?.page_id;

  // Listen for real-time icon/cover updates
  useEffect(() => {
    if (!wsProvider) return;
    const handler = (message: string) => {
      const msg = parseDocMessage(message);
      if (msg?.type === "page-metadata-updated") {
        setIcon(msg.icon);
        setCoverUrl(msg.cover_url);
      }
    };
    wsProvider.on("custom-message", handler);
    return () => wsProvider.off("custom-message", handler);
  }, [wsProvider]);

  // Resolve share info once per token
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.shares.resolve(token);
        if (!cancelled) {
          setInfo(data);
          setTitle(data.title);
          setIcon(data.icon);
          setCoverUrl(data.cover_url ?? null);
          setCanEdit(data.permission === "edit");
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
  }, [token]);

  // Load page-specific title, icon, and ancestors when active page changes
  useEffect(() => {
    if (!info) return;

    const pageId = activePage ?? info.page_id;

    // Clear stale data immediately so old page content doesn't flash
    if (activePage) {
      setTitle("");
      setIcon(null);
      setCoverUrl(null);
      setCanEdit(null);
    } else {
      setTitle(info.title);
      setIcon(info.icon);
      setCoverUrl(info.cover_url ?? null);
      setCanEdit(info.permission === "edit");
    }
    setAncestors([]);

    let cancelled = false;

    if (activePage) {
      api.pages
        .get(info.workspace_id, activePage, token)
        .then((page) => {
          if (!cancelled) {
            setTitle(page.title);
            setIcon(page.icon ?? null);
            setCanEdit(page.can_edit);
          }
        })
        .catch(() => {});
    }

    api.pages
      .ancestors(info.workspace_id, pageId, token)
      .then((data) => {
        if (!cancelled) setAncestors(data);
      })
      .catch(() => {
        if (!cancelled) setAncestors([]);
      });

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
      <div className="flex h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center px-8 py-3">
            <div className="inline-grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 shadow-sm shadow-accent-500/10">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <Skeleton className="ml-4 h-4 w-40" />
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-56 shrink-0 border-r border-zinc-800/50 px-2 py-4">
            <Skeleton className="h-5 w-3/4" />
          </nav>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-10">
              <PageLoadingSkeleton />
            </div>
          </main>
        </div>
        <Footer expanded={false} />
      </div>
    );
  }

  if (error || !info) {
    return (
      <PageErrorState
        message={error ?? "This shared link is invalid or has expired."}
        className="h-screen"
      />
    );
  }

  const isViewOnly = canEdit === null ? true : !canEdit;
  const displayPageId = currentPageId ?? info.page_id;

  return (
    <div className="flex h-screen flex-col">
      <header className="z-50 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-8">
          <button
            onClick={() => setMobileTreeOpen((o) => !o)}
            className="mr-2 flex items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 md:hidden"
            aria-label="Toggle outline"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="inline-grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 shadow-sm shadow-accent-500/10">
              <FileText className="h-5 w-5 text-white" />
            </div>
          </Link>

          <span className="ml-4 flex items-center gap-1.5 truncate text-sm text-zinc-400">
            {icon && <EmojiIcon emoji={icon} size={16} />}
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
        <MobileDrawer open={mobileTreeOpen} onClose={() => setMobileTreeOpen(false)}>
          <SharedPageTree
            workspaceId={info.workspace_id}
            rootPageId={info.page_id}
            rootTitle={info.title}
            rootIcon={info.icon}
            shareToken={token}
            activePageId={displayPageId}
            onNavigate={(pageId) => {
              handleNavigate(pageId);
              setMobileTreeOpen(false);
            }}
          />
        </MobileDrawer>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
            {coverUrl && !activePage && (
              <div className="-mx-4 -mt-10 mb-6 sm:-mx-8">
                <PageCover coverUrl={coverUrl} shareToken={token} />
              </div>
            )}

            {ancestors.length > 0 && (
              <div className="mb-4">
                <SharedBreadcrumbs
                  ancestors={ancestors}
                  currentTitle={title}
                  currentIcon={icon}
                  onNavigate={handleNavigate}
                />
              </div>
            )}

            {icon && (
              <div className="mb-2 pl-7">
                <EmojiIcon emoji={icon} size={36} />
              </div>
            )}

            <EditorPane
              key={displayPageId}
              pageId={displayPageId}
              initialTitle={activePage ? title : info.title}
              onTitleChange={setTitle}
              onProvider={setWsProvider}
              shareToken={token}
              readOnly={isViewOnly}
              workspaceId={info.workspace_id}
            />
          </div>
        </main>
      </div>

      <Footer expanded={false} />
    </div>
  );
}
