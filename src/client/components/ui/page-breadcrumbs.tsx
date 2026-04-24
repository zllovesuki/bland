import { Fragment, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Lock } from "lucide-react";
import type { Page, PageAncestor } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";

interface LabelProps {
  currentTitle: string;
  currentIcon: string | null;
}

interface WorkspaceFramedProps extends LabelProps {
  workspaceSlug: string;
  workspaceName?: string | null;
}

type PageBreadcrumbsProps =
  | (WorkspaceFramedProps & {
      mode: "workspace";
      pages: Page[];
      currentParentId: string | null;
    })
  | (WorkspaceFramedProps & {
      mode: "shared-in-workspace";
      ancestors: PageAncestor[];
    })
  | (LabelProps & {
      mode: "shared";
      ancestors: PageAncestor[];
      onNavigate: (pageId: string) => void;
    });

const RESTRICTED_TITLE = "You don't have access to this page";

function Sep() {
  return <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />;
}

function CurrentLabel({ title, icon }: { title: string; icon: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 truncate text-zinc-300">
      {icon && <EmojiIcon emoji={icon} size={12} />}
      {title || DEFAULT_PAGE_TITLE}
    </span>
  );
}

function RestrictedLabel() {
  return (
    <span className="flex items-center gap-1 text-zinc-500" title={RESTRICTED_TITLE}>
      <Lock className="h-2.5 w-2.5" />
      Restricted
    </span>
  );
}

function EllipsisDot() {
  return (
    <span className="select-none text-zinc-500" aria-hidden="true">
      …
    </span>
  );
}

function WorkspaceBreadcrumbs({
  currentTitle,
  currentIcon,
  workspaceSlug,
  workspaceName,
  pages,
  currentParentId,
}: WorkspaceFramedProps & { pages: Page[]; currentParentId: string | null }) {
  const ancestors = useMemo(() => {
    const chain: Page[] = [];
    const byId = new Map(pages.map((p) => [p.id, p]));
    let cur = currentParentId ? byId.get(currentParentId) : undefined;
    while (cur && chain.length < 10) {
      chain.push(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return chain.reverse();
  }, [pages, currentParentId]);

  const workspaceLabel = workspaceName ?? workspaceSlug;
  const immediateAncestor = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
  const hasHiddenPrefix = ancestors.length > 0;

  return (
    <nav className="flex min-w-0 items-center text-xs" aria-label="Breadcrumb">
      <div className="hidden min-w-0 items-center gap-1 md:flex">
        <Link
          to="/$workspaceSlug"
          params={{ workspaceSlug }}
          className="truncate text-zinc-400 transition-colors hover:text-zinc-300"
        >
          {workspaceLabel}
        </Link>
        {ancestors.map((a) => (
          <Fragment key={a.id}>
            <Sep />
            <Link
              to="/$workspaceSlug/$pageId"
              params={{ workspaceSlug, pageId: a.id }}
              className="inline-flex items-center gap-1 truncate text-zinc-400 transition-colors hover:text-zinc-300"
            >
              {a.icon && <EmojiIcon emoji={a.icon} size={12} />}
              {a.title || DEFAULT_PAGE_TITLE}
            </Link>
          </Fragment>
        ))}
        <Sep />
        <CurrentLabel title={currentTitle} icon={currentIcon} />
      </div>
      <div className="flex min-w-0 items-center gap-1 md:hidden">
        {hasHiddenPrefix && (
          <>
            <EllipsisDot />
            <Sep />
          </>
        )}
        {immediateAncestor ? (
          <Link
            to="/$workspaceSlug/$pageId"
            params={{ workspaceSlug, pageId: immediateAncestor.id }}
            className="inline-flex min-w-0 items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-300"
          >
            {immediateAncestor.icon && <EmojiIcon emoji={immediateAncestor.icon} size={12} />}
            <span className="truncate">{immediateAncestor.title || DEFAULT_PAGE_TITLE}</span>
          </Link>
        ) : (
          <Link
            to="/$workspaceSlug"
            params={{ workspaceSlug }}
            className="min-w-0 truncate text-zinc-400 transition-colors hover:text-zinc-300"
          >
            {workspaceLabel}
          </Link>
        )}
        <Sep />
        <EllipsisDot />
      </div>
    </nav>
  );
}

function SharedInWorkspaceBreadcrumbs({
  currentTitle,
  currentIcon,
  workspaceSlug,
  workspaceName,
  ancestors,
}: WorkspaceFramedProps & { ancestors: PageAncestor[] }) {
  const workspaceLabel = workspaceName ?? workspaceSlug;
  const immediateAncestor = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
  const hasHiddenPrefix = ancestors.length > 0;

  return (
    <nav className="flex min-w-0 items-center text-xs" aria-label="Breadcrumb">
      <div className="hidden min-w-0 items-center gap-1 md:flex">
        <span className="truncate text-zinc-400">{workspaceLabel}</span>
        {ancestors.map((a) => (
          <Fragment key={a.id}>
            <Sep />
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
              <RestrictedLabel />
            )}
          </Fragment>
        ))}
        <Sep />
        <CurrentLabel title={currentTitle} icon={currentIcon} />
      </div>
      <div className="flex min-w-0 items-center gap-1 md:hidden">
        {hasHiddenPrefix && (
          <>
            <EllipsisDot />
            <Sep />
          </>
        )}
        {immediateAncestor ? (
          immediateAncestor.accessible ? (
            <Link
              to="/$workspaceSlug/$pageId"
              params={{ workspaceSlug, pageId: immediateAncestor.id }}
              className="inline-flex min-w-0 items-center gap-1 text-zinc-400 transition-colors hover:text-zinc-300"
            >
              {immediateAncestor.icon && <EmojiIcon emoji={immediateAncestor.icon} size={12} />}
              <span className="truncate">{immediateAncestor.title || DEFAULT_PAGE_TITLE}</span>
            </Link>
          ) : (
            <RestrictedLabel />
          )
        ) : (
          <span className="min-w-0 truncate text-zinc-400">{workspaceLabel}</span>
        )}
        <Sep />
        <EllipsisDot />
      </div>
    </nav>
  );
}

function SharedBreadcrumbs({
  currentTitle,
  currentIcon,
  ancestors,
  onNavigate,
}: LabelProps & {
  ancestors: PageAncestor[];
  onNavigate: (pageId: string) => void;
}) {
  if (ancestors.length === 0) return null;

  const immediateAncestor = ancestors[ancestors.length - 1];
  const hasHiddenPrefix = ancestors.length > 1;

  return (
    <nav className="flex min-w-0 items-center text-xs" aria-label="Breadcrumb">
      <div className="hidden min-w-0 items-center gap-1 md:flex">
        {ancestors.map((a) => (
          <Fragment key={a.id}>
            {a.accessible ? (
              <button
                onClick={() => onNavigate(a.id)}
                className="inline-flex items-center gap-1 truncate text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {a.icon && <EmojiIcon emoji={a.icon} size={12} />}
                {a.title || DEFAULT_PAGE_TITLE}
              </button>
            ) : (
              <RestrictedLabel />
            )}
            <Sep />
          </Fragment>
        ))}
        <CurrentLabel title={currentTitle} icon={currentIcon} />
      </div>
      <div className="flex min-w-0 items-center gap-1 md:hidden">
        {hasHiddenPrefix && (
          <>
            <EllipsisDot />
            <Sep />
          </>
        )}
        {immediateAncestor.accessible ? (
          <button
            onClick={() => onNavigate(immediateAncestor.id)}
            className="inline-flex min-w-0 items-center gap-1 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {immediateAncestor.icon && <EmojiIcon emoji={immediateAncestor.icon} size={12} />}
            <span className="truncate">{immediateAncestor.title || DEFAULT_PAGE_TITLE}</span>
          </button>
        ) : (
          <RestrictedLabel />
        )}
        <Sep />
        <EllipsisDot />
      </div>
    </nav>
  );
}

export function PageBreadcrumbs(props: PageBreadcrumbsProps) {
  if (props.mode === "workspace") {
    return (
      <WorkspaceBreadcrumbs
        currentTitle={props.currentTitle}
        currentIcon={props.currentIcon}
        workspaceSlug={props.workspaceSlug}
        workspaceName={props.workspaceName}
        pages={props.pages}
        currentParentId={props.currentParentId}
      />
    );
  }
  if (props.mode === "shared-in-workspace") {
    return (
      <SharedInWorkspaceBreadcrumbs
        currentTitle={props.currentTitle}
        currentIcon={props.currentIcon}
        workspaceSlug={props.workspaceSlug}
        workspaceName={props.workspaceName}
        ancestors={props.ancestors}
      />
    );
  }
  return (
    <SharedBreadcrumbs
      currentTitle={props.currentTitle}
      currentIcon={props.currentIcon}
      ancestors={props.ancestors}
      onNavigate={props.onNavigate}
    />
  );
}
