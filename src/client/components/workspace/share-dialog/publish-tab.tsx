import { houseOff } from "@lucide/lab";
import { Check, Copy, Home, Icon, Loader2 } from "lucide-react";

import { Skeleton } from "@/client/components/ui/skeleton";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import type { SitePageStatus } from "@/shared/types";

import { useShareDialogShell, useSitePublish } from "./context";

export function PublishTabContent() {
  const { publishAffordance } = useShareDialogShell();
  const {
    site,
    pageStatus,
    loading,
    saving,
    slugSavePending,
    siteTogglePending,
    setHomePending,
    publishPending,
    unpublishPending,
    featureDisabled,
    error,
    slugDraft,
    setSlugDraft,
    saveSiteSlug,
    toggleSitePublished,
    publishPage,
    unpublishPage,
    isHome,
    toggleHomePage,
    copyPublicUrl,
    copied,
  } = useSitePublish();

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-4 w-1/2 rounded-sm" />
        <Skeleton className="h-7 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    );
  }

  if (featureDisabled) {
    return <p className="px-2 py-3 text-sm text-zinc-400">Sites are not enabled on this instance.</p>;
  }

  const siteRow = site?.site ?? null;
  const baseDomain = site?.base_domain ?? null;
  const sitePublished = !!siteRow?.published_at;
  const showManageSite = isActionVisible(publishAffordance.manageSite);
  const canManage = isActionEnabled(publishAffordance.manageSite);
  const siteReady = !!siteRow && sitePublished;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {pageStatus ? (
        <PagePublicationSection
          status={pageStatus}
          siteReady={siteReady}
          showManageSite={showManageSite}
          canManage={canManage}
          saving={saving}
          publishPending={publishPending}
          unpublishPending={unpublishPending}
          setHomePending={setHomePending}
          isHome={isHome}
          copied={copied}
          onCopy={copyPublicUrl}
          onPublish={() => void publishPage()}
          onUnpublish={() => void unpublishPage()}
          onToggleHome={() => void toggleHomePage()}
        />
      ) : null}

      {showManageSite && baseDomain ? (
        <SiteSettingsSection
          baseDomain={baseDomain}
          slugDraft={slugDraft}
          setSlugDraft={setSlugDraft}
          siteRow={siteRow}
          sitePublished={sitePublished}
          saving={saving}
          slugSavePending={slugSavePending}
          siteTogglePending={siteTogglePending}
          canManage={canManage}
          dividerAbove={!!pageStatus}
          onSaveSlug={() => void saveSiteSlug(slugDraft.trim())}
          onToggleSite={() => void toggleSitePublished()}
        />
      ) : null}
    </div>
  );
}

interface PagePublicationSectionProps {
  status: SitePageStatus;
  siteReady: boolean;
  showManageSite: boolean;
  canManage: boolean;
  saving: boolean;
  publishPending: boolean;
  unpublishPending: boolean;
  setHomePending: boolean;
  isHome: boolean;
  copied: boolean;
  onCopy: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onToggleHome: () => void;
}

function PagePublicationSection({
  status,
  siteReady,
  showManageSite,
  canManage,
  saving,
  publishPending,
  unpublishPending,
  setHomePending,
  isHome,
  copied,
  onCopy,
  onPublish,
  onUnpublish,
  onToggleHome,
}: PagePublicationSectionProps) {
  if (status.canvas) {
    return <p className="text-sm text-zinc-500">Canvas pages cannot be published.</p>;
  }

  return (
    <section className="space-y-2">
      <StatusRow status={status} />
      {status.public_url ? <PublicUrlPill url={status.public_url} copied={copied} onCopy={onCopy} /> : null}

      {showManageSite ? (
        <PageActions
          status={status}
          siteReady={siteReady}
          canManage={canManage}
          saving={saving}
          publishPending={publishPending}
          unpublishPending={unpublishPending}
          setHomePending={setHomePending}
          isHome={isHome}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onToggleHome={onToggleHome}
        />
      ) : (
        <p className="text-xs text-zinc-500">Only admins can publish pages.</p>
      )}
    </section>
  );
}

function StatusRow({ status }: { status: SitePageStatus }) {
  if (status.is_explicit_root) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
        <span className="text-sm font-medium text-zinc-200">Live on the web</span>
      </div>
    );
  }
  if (status.inherited_from) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
        <span className="text-sm font-medium text-zinc-200">
          Live via <span className="text-zinc-100">{status.inherited_from.title || "ancestor"}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-zinc-500" aria-hidden="true" />
      <span className="text-sm font-medium text-zinc-300">Page is private</span>
    </div>
  );
}

function PublicUrlPill({ url, copied, onCopy }: { url: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">{url}</code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        aria-label="Copy public URL"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

interface PageActionsProps {
  status: SitePageStatus;
  siteReady: boolean;
  canManage: boolean;
  saving: boolean;
  publishPending: boolean;
  unpublishPending: boolean;
  setHomePending: boolean;
  isHome: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onToggleHome: () => void;
}

function PageActions({
  status,
  siteReady,
  canManage,
  saving,
  publishPending,
  unpublishPending,
  setHomePending,
  isHome,
  onPublish,
  onUnpublish,
  onToggleHome,
}: PageActionsProps) {
  // Inherited-from-ancestor: explain the relationship and offer a way to
  // promote the page to its own root.
  if (!status.is_explicit_root && status.inherited_from) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">
          This page is live because{" "}
          <span className="text-zinc-200">{status.inherited_from.title || "an ancestor"}</span> is published.
        </p>
        <button
          type="button"
          disabled={!canManage || saving || !siteReady}
          onClick={onPublish}
          className="inline-flex items-center gap-1 text-xs text-accent-400 transition-colors hover:text-accent-300 disabled:opacity-50"
        >
          {publishPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Publish directly <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  // Explicit root: stop-publishing primary + set-as-home secondary
  if (status.is_explicit_root) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canManage || saving}
          onClick={onUnpublish}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50"
        >
          {unpublishPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Stop publishing
        </button>
        <button
          type="button"
          disabled={!canManage || saving}
          onClick={onToggleHome}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50"
        >
          {setHomePending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isHome ? (
            <Icon iconNode={houseOff} className="h-3.5 w-3.5" />
          ) : (
            <Home className="h-3.5 w-3.5" />
          )}
          {isHome ? "Unset as home" : "Set as home"}
        </button>
      </div>
    );
  }

  // Not published: primary "Publish this page" CTA, or note when no site exists yet
  if (!siteReady) {
    return <p className="text-xs text-zinc-500">Set up your site URL below to publish this page.</p>;
  }

  return (
    <button
      type="button"
      disabled={!canManage || saving}
      onClick={onPublish}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
    >
      {publishPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      Publish this page
    </button>
  );
}

interface SiteSettingsSectionProps {
  baseDomain: string;
  slugDraft: string;
  setSlugDraft: (next: string) => void;
  siteRow: { published_at: string | null } | null;
  sitePublished: boolean;
  saving: boolean;
  slugSavePending: boolean;
  siteTogglePending: boolean;
  canManage: boolean;
  dividerAbove: boolean;
  onSaveSlug: () => void;
  onToggleSite: () => void;
}

function SiteSettingsSection({
  baseDomain,
  slugDraft,
  setSlugDraft,
  siteRow,
  sitePublished,
  saving,
  slugSavePending,
  siteTogglePending,
  canManage,
  dividerAbove,
  onSaveSlug,
  onToggleSite,
}: SiteSettingsSectionProps) {
  return (
    <section className={dividerAbove ? "space-y-2 border-t border-zinc-800/60 pt-3" : "space-y-2"}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Site settings</p>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={slugDraft}
          onChange={(e) => setSlugDraft(e.target.value)}
          placeholder="your-slug"
          disabled={!canManage || saving}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-2 text-sm text-zinc-300 outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30 disabled:opacity-60"
          aria-label="Site slug"
        />
        <span className="shrink-0 text-xs text-zinc-500">.{baseDomain}</span>
        <button
          type="button"
          disabled={!canManage || saving || slugDraft.trim() === ""}
          onClick={onSaveSlug}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2 py-1 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50"
        >
          {slugSavePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {siteRow ? "Save" : "Create site"}
        </button>
      </div>
      {siteRow ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canManage || saving}
            onClick={onToggleSite}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 hover:underline disabled:opacity-50"
            style={{ textUnderlineOffset: "4px" }}
          >
            {siteTogglePending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {sitePublished ? "Take site offline" : "Bring site online"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
