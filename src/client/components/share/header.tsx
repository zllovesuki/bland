import { Link } from "@tanstack/react-router";
import { FileText, Eye, Menu } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { useShareView } from "@/client/components/share/use-share-view";
import { useOptionalPageSurface } from "@/client/components/page-surface/use-page-surface";

interface ShareHeaderProps {
  onToggleMobileSidebar: () => void;
}

export function ShareHeader({ onToggleMobileSidebar }: ShareHeaderProps) {
  const { status, info } = useShareView();
  const surface = useOptionalPageSurface();

  const readyPage = surface?.state.kind === "ready" ? surface.state.page : null;
  const title = readyPage?.title ?? "";
  const icon = readyPage?.icon ?? null;

  const isTopLoading = status === "loading";
  const isPageLoading = !surface || surface.state.kind === "loading";
  const canOpenSidebar = status === "ready" && !!info;
  const isViewOnly = readyPage ? readyPage.can_edit === false : !info || info.permission === "view";

  return (
    <header className="z-50 shrink-0 border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-8">
        <button
          onClick={onToggleMobileSidebar}
          disabled={!canOpenSidebar}
          className="mr-2 flex items-center justify-center rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:pointer-events-none disabled:opacity-40 md:hidden"
          aria-label="Toggle outline"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <div className="inline-grid h-9 w-9 place-items-center rounded-lg bg-accent-500">
            <FileText className="h-5 w-5 text-white" />
          </div>
        </Link>

        <span className="ml-4 flex items-center gap-1.5 truncate text-sm text-zinc-400">
          {isTopLoading || isPageLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <>
              {icon && <EmojiIcon emoji={icon} size={16} />}
              {title || DEFAULT_PAGE_TITLE}
            </>
          )}
        </span>

        <div className="flex-1" />

        {!isTopLoading && isViewOnly && (
          <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            <Eye className="h-3 w-3" />
            View only
          </span>
        )}
      </div>
    </header>
  );
}
