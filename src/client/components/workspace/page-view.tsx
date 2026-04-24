import { useState, type ReactNode } from "react";
import type YProvider from "y-partyserver/provider";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PanelRightOpen } from "lucide-react";
import { useCanonicalPageContext } from "@/client/components/workspace/use-canonical-page-context";
import { useAuthStore } from "@/client/stores/auth-store";
import { deriveWorkspacePageAffordance, type WorkspacePageAffordance } from "@/client/lib/affordance/workspace-page";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import type { ActivePageSnapshot } from "@/client/lib/active-page-model";
import { DocumentPage } from "@/client/components/editor/document-page";
import { CanvasPage } from "@/client/components/canvas/canvas-page";
import { PageBreadcrumbs } from "@/client/components/ui/page-breadcrumbs";
import { PageByline } from "@/client/components/ui/page-byline";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { type CanvasStageLayout, PAGE_CONTENT_COLUMN_CLASS } from "@/client/components/ui/page-layout";
import { AvatarStack } from "@/client/components/presence/avatar-stack";
import { SyncStatusDot } from "@/client/components/presence/sync-status";
import { IconPicker } from "@/client/components/icon-picker";
import { CoverPicker } from "@/client/components/cover-picker";
import { ShareDialog } from "@/client/components/workspace/share-dialog";
import { SummarizeSheet } from "@/client/components/workspace/summarize-sheet";
import { useSyncStatus, type SyncStatus } from "@/client/hooks/use-sync";
import { useOnline } from "@/client/hooks/use-online";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { CanonicalActivePageBoundary } from "@/client/components/active-page/canonical";
import {
  useActivePageActions,
  useActivePageState,
  useActivePageSync,
} from "@/client/components/active-page/use-active-page";
import { useCanonicalPageActions } from "@/client/components/workspace/use-canonical-page-actions";
import { useWorkspaceLayoutMode } from "@/client/components/workspace/layout-mode-context";
import type { Page, PageAncestor, Workspace } from "@/shared/types";

export function PageView() {
  const { pageId } = useParams({ strict: false }) as { pageId: string };
  return (
    <CanonicalActivePageBoundary key={pageId}>
      <PageViewContent />
    </CanonicalActivePageBoundary>
  );
}

function PageViewContent() {
  const params = useParams({ strict: false }) as {
    workspaceSlug: string;
    pageId: string;
  };
  const navigate = useNavigate();
  const activePageState = useActivePageState();
  const { syncProvider, setSyncProvider } = useActivePageSync();
  const { patchPage } = useActivePageActions();
  const {
    workspaceId: effectiveWorkspaceId,
    workspace,
    currentPageMeta,
    pages,
    members,
    accessMode,
    workspaceRole,
  } = useCanonicalPageContext();
  const currentUser = useAuthStore((s) => s.user);
  const online = useOnline();
  const isSharedMode = accessMode === "shared";
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const { status } = useSyncStatus(syncProvider, online);
  const { expanded } = useWorkspaceLayoutMode();
  const canvasLayout: CanvasStageLayout = expanded ? "stage" : "centered";

  const page = activePageState.kind === "ready" ? activePageState.snapshot : null;
  const ancestors = activePageState.kind === "ready" ? activePageState.ancestors : [];
  const creator =
    currentPageMeta && currentPageMeta.created_by
      ? (members.find((member) => member.user_id === currentPageMeta.created_by)?.user ?? null)
      : null;
  const docFooterLeading =
    creator && currentPageMeta ? <PageByline creator={creator} createdAt={currentPageMeta.created_at} /> : undefined;

  useDocumentTitle(page?.title || DEFAULT_PAGE_TITLE);

  const { handleTitleChange, handleIconChange, handleCoverChange } = useCanonicalPageActions({
    workspace,
    page,
    syncProvider,
    patchPage,
  });

  if (activePageState.kind === "loading") {
    return (
      <PageLoadingSkeleton
        canvasLayout={canvasLayout}
        kind={currentPageMeta?.kind ?? "doc"}
        documentLayout={expanded ? "rail" : "inline"}
      />
    );
  }

  if (activePageState.kind === "unavailable" || !page || !effectiveWorkspaceId) {
    return (
      <PageErrorState
        message={activePageState.kind === "unavailable" ? activePageState.message : "Page not found."}
        className="h-full"
        action={{
          label: "Go back",
          onClick: () => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate({
                to: "/$workspaceSlug",
                params: { workspaceSlug: params.workspaceSlug },
              });
            }
          },
        }}
      />
    );
  }

  const pageAffordance = deriveWorkspacePageAffordance({
    accessMode,
    workspaceRole: workspaceRole ?? "none",
    pageKind: page.kind,
    pageAccess: activePageState.access.mode,
    ownsPage: currentUser?.id === currentPageMeta?.created_by,
    workspaceId: effectiveWorkspaceId,
    online,
  });

  const headerActions = (
    <>
      {pageAffordance.kind === "doc" && pageAffordance.editor.canSummarizePage && (
        <button
          type="button"
          aria-label="Summarize page"
          title="Summarize page"
          aria-expanded={summarizeOpen}
          className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:border-accent-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30"
          onClick={() => setSummarizeOpen((value) => !value)}
        >
          <PanelRightOpen size={14} />
          <span className="hidden md:inline">Summarize</span>
        </button>
      )}
      {!isSharedMode && workspace && isActionVisible(pageAffordance.shareDialog) && (
        <ShareDialog
          pageId={page.id}
          disabled={!isActionEnabled(pageAffordance.shareDialog)}
          title={pageAffordance.shareDialog.kind === "disabled" ? pageAffordance.shareDialog.reason : undefined}
        />
      )}
    </>
  );
  const workspaceChrome = (
    <WorkspacePageChrome
      page={page}
      currentPageMeta={currentPageMeta}
      workspace={workspace}
      pages={pages}
      ancestors={ancestors}
      pageAffordance={pageAffordance}
      workspaceSlug={params.workspaceSlug}
      syncProvider={syncProvider}
      status={status}
      onIconChange={handleIconChange}
      onCoverChange={handleCoverChange}
      headerActions={headerActions}
    />
  );

  return (
    <>
      {pageAffordance.kind === "doc" ? (
        <DocumentPage
          pageId={page.id}
          initialTitle={page.title}
          onTitleChange={handleTitleChange}
          onProvider={setSyncProvider}
          workspaceId={effectiveWorkspaceId}
          affordance={pageAffordance.editor}
          outlineMode={expanded ? "rail" : "inline"}
          chrome={workspaceChrome}
          docFooterLeading={docFooterLeading}
        />
      ) : (
        <CanvasPage
          pageId={page.id}
          initialTitle={page.title}
          onTitleChange={handleTitleChange}
          onProvider={setSyncProvider}
          workspaceId={effectiveWorkspaceId}
          affordance={pageAffordance.canvas}
          layout={canvasLayout}
          chrome={workspaceChrome}
        />
      )}

      {pageAffordance.kind === "doc" &&
        (pageAffordance.editor.canSummarizePage || pageAffordance.editor.canAskPage) && (
          <SummarizeSheet
            open={summarizeOpen}
            onClose={() => setSummarizeOpen(false)}
            workspaceId={effectiveWorkspaceId}
            pageId={page.id}
            canSummarize={pageAffordance.editor.canSummarizePage}
            canAsk={pageAffordance.editor.canAskPage}
          />
        )}
    </>
  );
}

interface WorkspacePageChromeProps {
  page: ActivePageSnapshot;
  currentPageMeta: Page | null;
  workspace: Workspace | null;
  pages: Page[];
  ancestors: PageAncestor[];
  pageAffordance: WorkspacePageAffordance;
  workspaceSlug: string;
  syncProvider: YProvider | null;
  status: SyncStatus;
  onIconChange: (icon: string | null) => void;
  onCoverChange: (cover: string | null) => void;
  headerActions?: ReactNode;
}

function WorkspacePageChrome({
  page,
  currentPageMeta,
  workspace,
  pages,
  ancestors,
  pageAffordance,
  workspaceSlug,
  syncProvider,
  status,
  onIconChange,
  onCoverChange,
  headerActions,
}: WorkspacePageChromeProps) {
  const canEditMetadata = !!workspace && isActionVisible(pageAffordance.editPageMetadata);

  return (
    <>
      <div className={PAGE_CONTENT_COLUMN_CLASS}>
        {page.coverUrl && (
          <div className="group/cover relative -mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0">
            <PageCover coverUrl={page.coverUrl} />
            {canEditMetadata && workspace ? (
              <div className="absolute right-2 top-2">
                <CoverPicker
                  currentCover={page.coverUrl}
                  onSelect={onCoverChange}
                  workspaceId={workspace.id}
                  pageId={page.id}
                  disabled={!isActionEnabled(pageAffordance.editPageMetadata)}
                  title={
                    pageAffordance.editPageMetadata.kind === "disabled"
                      ? pageAffordance.editPageMetadata.reason
                      : undefined
                  }
                />
              </div>
            ) : null}
          </div>
        )}

        <div className="mb-6 flex min-h-6 items-center justify-between">
          {pageAffordance.breadcrumbMode === "restricted" ? (
            <PageBreadcrumbs
              mode="shared-in-workspace"
              currentTitle={page.title}
              currentIcon={page.icon}
              workspaceSlug={workspaceSlug}
              workspaceName={workspace?.name}
              ancestors={ancestors}
            />
          ) : (
            <PageBreadcrumbs
              mode="workspace"
              currentTitle={page.title}
              currentIcon={page.icon}
              currentParentId={currentPageMeta?.parent_id ?? null}
              workspaceSlug={workspaceSlug}
              workspaceName={workspace?.name}
              pages={pages}
            />
          )}
          <div className="flex items-center gap-3">
            {headerActions}
            <AvatarStack
              awareness={syncProvider?.awareness ?? null}
              localClientId={syncProvider?.awareness.clientID ?? null}
            />
            <SyncStatusDot status={status} />
          </div>
        </div>

        <div className="mb-4 flex min-h-9 items-center gap-3 pl-7">
          {canEditMetadata && workspace ? (
            <>
              <IconPicker
                currentIcon={page.icon}
                onSelect={onIconChange}
                disabled={!isActionEnabled(pageAffordance.editPageMetadata)}
                title={
                  pageAffordance.editPageMetadata.kind === "disabled"
                    ? pageAffordance.editPageMetadata.reason
                    : undefined
                }
              />
              {!page.coverUrl && (
                <CoverPicker
                  currentCover={null}
                  onSelect={onCoverChange}
                  workspaceId={workspace.id}
                  pageId={page.id}
                  disabled={!isActionEnabled(pageAffordance.editPageMetadata)}
                  title={
                    pageAffordance.editPageMetadata.kind === "disabled"
                      ? pageAffordance.editPageMetadata.reason
                      : undefined
                  }
                />
              )}
            </>
          ) : (
            page.icon && <EmojiIcon emoji={page.icon} size={28} />
          )}
        </div>
      </div>
    </>
  );
}
