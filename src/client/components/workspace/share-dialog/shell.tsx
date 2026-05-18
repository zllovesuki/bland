import { useRef, type ReactNode } from "react";
import { Globe2, Share2, Users } from "lucide-react";

import { Skeleton } from "@/client/components/ui/skeleton";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import type { ShareDialogAffordance } from "@/client/lib/affordance/share-dialog";

import { useShareDialogShell } from "./context";
import { PublishTabContent } from "./publish-tab";
import { ShareLinkSection, SharePeopleSection } from "./share-tab";
import type { DialogTab } from "./types";

export function ShareDialogTrigger() {
  const { disabled, title, toggleOpen } = useShareDialogShell();

  return (
    <button
      onClick={toggleOpen}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Share2 className="h-3.5 w-3.5" />
      Share
    </button>
  );
}

export function ShareDialogPanel() {
  const { open, close, loading, error, dialogAffordance, publishAffordance, activeTab, setActiveTab } =
    useShareDialogShell();
  const panelRef = useRef<HTMLDivElement>(null);

  useClickOutside(panelRef, close, open);

  if (!open) return null;

  const showPublishTab = publishAffordance.showPublishTab;

  return (
    <div
      ref={panelRef}
      className="animate-scale-fade origin-top-right absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-700 bg-zinc-800 p-3 shadow-lg"
    >
      {showPublishTab && (
        <div className="mb-3 flex items-center gap-1 border-b border-zinc-700/60">
          <DialogTabButton tab="share" active={activeTab === "share"} onSelect={setActiveTab}>
            <Users className="h-3.5 w-3.5" />
            Share
          </DialogTabButton>
          <DialogTabButton tab="publish" active={activeTab === "publish"} onSelect={setActiveTab}>
            <Globe2 className="h-3.5 w-3.5" />
            Publish
          </DialogTabButton>
        </div>
      )}

      {activeTab === "share" || !showPublishTab ? (
        <ShareTabContent loading={loading} error={error} dialogAffordance={dialogAffordance} />
      ) : (
        <PublishTabContent />
      )}
    </div>
  );
}

function DialogTabButton({
  tab,
  active,
  onSelect,
  children,
}: {
  tab: DialogTab;
  active: boolean;
  onSelect: (tab: DialogTab) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(tab)}
      className={[
        "flex items-center gap-1.5 px-2 pb-2 pt-1 text-sm transition-colors",
        active ? "border-b-2 border-accent-500/70 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ShareTabContent({
  loading,
  error,
  dialogAffordance,
}: {
  loading: boolean;
  error: string | null;
  dialogAffordance: ShareDialogAffordance;
}) {
  if (loading) {
    return (
      <div aria-busy="true">
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Skeleton className="h-3 w-3 rounded-sm" />
            <Skeleton className="h-3.5 w-14" />
          </div>
          <div className="mb-2 flex items-center gap-1.5">
            <Skeleton className="h-8 flex-1 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-12 rounded-md" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-7 w-full rounded-md" />
            <Skeleton className="h-7 w-full rounded-md" />
          </div>
        </div>
        <div className="border-t border-zinc-700/50 pt-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Skeleton className="h-3 w-3 rounded-sm" />
            <Skeleton className="h-3.5 w-10" />
          </div>
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {dialogAffordance.showPeopleSection && <SharePeopleSection />}
      {dialogAffordance.showLinkSection && <ShareLinkSection />}
    </>
  );
}
