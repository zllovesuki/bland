import { Link } from "@tanstack/react-router";
import { FileText, Eye, Menu } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { useSharedPagePresentation } from "@/client/components/share/use-share-view";
import { deriveSharePageAffordance } from "@/client/lib/affordance/share-page";
import { useOnline } from "@/client/hooks/use-online";
import { useScrollVisibility } from "@/client/hooks/use-scroll-visibility";

interface ShareHeaderProps {
  onToggleMobileSidebar: () => void;
}

export function ShareHeader({ onToggleMobileSidebar }: ShareHeaderProps) {
  const presentation = useSharedPagePresentation();
  const online = useOnline();
  const visible = useScrollVisibility("main-content");
  const pageAffordance = deriveSharePageAffordance({
    pageAccess: presentation.isViewOnly ? "view" : "edit",
    workspaceId: presentation.workspaceId,
    online,
  });

  return (
    <header
      className={`relative z-50 shrink-0 border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur-sm transition-[margin-top] duration-300 ease-out ${
        visible ? "mt-0" : "-mt-[61px]"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-8">
        <button
          onClick={onToggleMobileSidebar}
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
          {presentation.isPageLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <>
              {presentation.displayIcon && <EmojiIcon emoji={presentation.displayIcon} size={16} />}
              {presentation.displayTitle || DEFAULT_PAGE_TITLE}
            </>
          )}
        </span>

        <div className="flex-1" />

        {pageAffordance.showViewOnlyBadge && (
          <span
            className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
            title="Read-only. Ask the owner for edit access."
          >
            <Eye className="h-3 w-3" />
            View only
          </span>
        )}
      </div>
    </header>
  );
}
