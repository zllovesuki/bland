import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCanonicalPageContext } from "@/client/components/workspace/use-canonical-page-context";
import { useAuthStore } from "@/client/stores/auth-store";
import { getMyRole } from "@/client/lib/workspace-role";
import { deriveWorkspacePageAffordance } from "@/client/lib/affordance/workspace-page";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import { friendlyName } from "@/client/lib/friendly-name";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import { EditorPane } from "@/client/components/editor/editor-pane";
import { ErrorBoundary } from "@/client/components/error-boundary";
import { PageBreadcrumbs } from "@/client/components/ui/page-breadcrumbs";
import { PageByline } from "@/client/components/ui/page-byline";
import { PageCover } from "@/client/components/ui/page-cover";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageLoadingSkeleton } from "@/client/components/ui/page-loading-skeleton";
import { AvatarStack } from "@/client/components/presence/avatar-stack";
import { SyncStatusDot } from "@/client/components/presence/sync-status";
import { IconPicker } from "@/client/components/icon-picker";
import { CoverPicker } from "@/client/components/cover-picker";
import { ShareDialog } from "@/client/components/share-dialog";
import { useMediaQuery } from "@/client/hooks/use-media-query";
import { useSyncStatus } from "@/client/hooks/use-sync";
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
  const { workspaceId: effectiveWorkspaceId, workspace, pages, members, accessMode } = useCanonicalPageContext();
  const currentUser = useAuthStore((s) => s.user);
  const online = useOnline();
  const role = getMyRole(members, currentUser);
  const isSharedMode = accessMode === "shared";
  const [outlineRailEl, setOutlineRailEl] = useState<HTMLDivElement | null>(null);
  const showOutlineRail = useMediaQuery("(min-width: 1024px)");
  const { status } = useSyncStatus(syncProvider, online);
  const currentPageMeta = pages.find((candidate) => candidate.id === params.pageId) ?? null;

  const page = activePageState.kind === "ready" ? activePageState.snapshot : null;
  const ancestors = activePageState.kind === "ready" ? activePageState.ancestors : [];
  const creator = currentPageMeta
    ? (members.find((m) => m.user_id === currentPageMeta.created_by)?.user ?? null)
    : null;
  const docFooterLeading =
    creator && currentPageMeta ? <PageByline creator={creator} createdAt={currentPageMeta.created_at} /> : undefined;
  const pageAffordance =
    page && activePageState.kind === "ready"
      ? deriveWorkspacePageAffordance({
          accessMode,
          workspaceRole: role ?? "none",
          pageAccess: activePageState.access.mode,
          ownsPage: currentUser?.id === currentPageMeta?.created_by,
          workspaceId: effectiveWorkspaceId ?? undefined,
          online,
        })
      : null;

  useDocumentTitle(page?.title || DEFAULT_PAGE_TITLE);

  const { handleTitleChange, handleIconChange, handleCoverChange } = useCanonicalPageActions({
    workspace,
    page,
    syncProvider,
    patchPage,
  });

  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m.user])), [members]);
  const resolveIdentity = useCallback<ResolveIdentity>(
    (userId, clientId) => {
      const real = userId ? membersById.get(userId) : undefined;
      if (real) {
        return { name: real.name, avatar_url: real.avatar_url };
      }
      return { name: friendlyName(userId ?? String(clientId)), avatar_url: null };
    },
    [membersById],
  );

  if (activePageState.kind === "loading") {
    return <PageLoadingSkeleton />;
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

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:grid lg:max-w-[62rem] lg:grid-cols-[minmax(0,48rem)_10rem] lg:gap-4 xl:max-w-[66rem] xl:grid-cols-[minmax(0,48rem)_12rem] xl:gap-6">
      <div className="min-w-0">
        {page.coverUrl && (
          <div className="group/cover relative -mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0">
            <PageCover coverUrl={page.coverUrl} />
            {workspace && pageAffordance && isActionVisible(pageAffordance.editPageMetadata) && (
              <div className="absolute right-2 top-2">
                <CoverPicker
                  currentCover={page.coverUrl}
                  onSelect={handleCoverChange}
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
            )}
          </div>
        )}

        <div className="mb-6 flex min-h-6 items-center justify-between">
          {pageAffordance?.breadcrumbMode === "restricted" ? (
            <PageBreadcrumbs
              mode="shared-in-workspace"
              currentTitle={page.title}
              currentIcon={page.icon}
              workspaceSlug={params.workspaceSlug}
              workspaceName={workspace?.name}
              ancestors={ancestors}
            />
          ) : (
            <PageBreadcrumbs
              mode="workspace"
              currentTitle={page.title}
              currentIcon={page.icon}
              currentParentId={currentPageMeta?.parent_id ?? null}
              workspaceSlug={params.workspaceSlug}
              workspaceName={workspace?.name}
              pages={pages}
            />
          )}
          <div className="flex items-center gap-3">
            {!isSharedMode && workspace && pageAffordance && isActionVisible(pageAffordance.shareDialog) && (
              <ShareDialog
                pageId={page.id}
                disabled={!isActionEnabled(pageAffordance.shareDialog)}
                title={pageAffordance.shareDialog.kind === "disabled" ? pageAffordance.shareDialog.reason : undefined}
              />
            )}
            <AvatarStack
              awareness={syncProvider?.awareness ?? null}
              localClientId={syncProvider?.awareness.clientID ?? null}
              resolveIdentity={resolveIdentity}
            />
            <SyncStatusDot status={status} />
          </div>
        </div>

        <div className="mb-4 flex min-h-9 items-center gap-3 pl-7">
          {workspace && pageAffordance && isActionVisible(pageAffordance.editPageMetadata) ? (
            <>
              <IconPicker
                currentIcon={page.icon}
                onSelect={handleIconChange}
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
                  onSelect={handleCoverChange}
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

        <ErrorBoundary key={page.id}>
          <EditorPane
            pageId={page.id}
            initialTitle={page.title}
            onTitleChange={handleTitleChange}
            onProvider={setSyncProvider}
            workspaceId={effectiveWorkspaceId}
            outline={showOutlineRail ? { kind: "rail", target: outlineRailEl } : { kind: "inline" }}
            affordance={
              pageAffordance?.editor ?? {
                documentEditable: false,
                canInsertPageMentions: false,
                canInsertImages: false,
              }
            }
            resolveIdentity={resolveIdentity}
            docFooterLeading={docFooterLeading}
          />
        </ErrorBoundary>
      </div>

      {showOutlineRail ? (
        <aside className="pt-[5.5rem]" aria-label="Document outline">
          <div ref={setOutlineRailEl} className="sticky top-8" />
        </aside>
      ) : null}
    </div>
  );
}
