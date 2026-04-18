import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type YProvider from "y-partyserver/provider";
import { api } from "@/client/lib/api";
import { confirm } from "@/client/components/confirm";
import { toast } from "@/client/components/toast";
import { getArchivePageConfirmMessage } from "@/client/lib/page-archive";
import { reportClientError } from "@/client/lib/report-client-error";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import type { Workspace } from "@/shared/types";
import type { ActivePagePatch, ActivePageSnapshot } from "@/client/lib/active-page-model";

interface UseCanonicalPageActionsInput {
  workspace: Workspace | null;
  page: ActivePageSnapshot | null;
  workspaceSlug: string;
  directChildCount: number;
  syncProvider: YProvider | null;
  patchPage: (updates: ActivePagePatch) => void;
}

export function useCanonicalPageActions({
  workspace,
  page,
  workspaceSlug,
  directChildCount,
  syncProvider,
  patchPage,
}: UseCanonicalPageActionsInput) {
  const navigate = useNavigate();
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);
  const archivePage = useWorkspaceStore((s) => s.archivePageInSnapshot);
  const [isArchiving, setIsArchiving] = useState(false);
  const iconVersionRef = useRef(0);
  const coverVersionRef = useRef(0);

  const patchRuntimeAndSnapshot = useCallback(
    (updates: ActivePagePatch) => {
      if (!workspace || !page) return;
      patchPage(updates);
      updatePage(workspace.id, page.id, {
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
        ...(updates.coverUrl !== undefined ? { cover_url: updates.coverUrl } : {}),
      });
    },
    [workspace, page, patchPage, updatePage],
  );

  const handleArchive = useCallback(async () => {
    if (!workspace || !page || isArchiving) return;
    const ok = await confirm({
      title: "Archive page",
      message: getArchivePageConfirmMessage(page.title, directChildCount),
      variant: "danger",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    setIsArchiving(true);
    try {
      await api.pages.delete(workspace.id, page.id);
      archivePage(workspace.id, page.id);
      navigate({
        to: "/$workspaceSlug",
        params: { workspaceSlug },
      });
    } catch {
      toast.error("Failed to archive page");
      setIsArchiving(false);
    }
  }, [workspace, page, directChildCount, isArchiving, archivePage, navigate, workspaceSlug]);

  const handleTitleChange = useCallback(
    (title: string) => {
      patchRuntimeAndSnapshot({ title });
    },
    [patchRuntimeAndSnapshot],
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      if (!workspace || !page) return;
      const version = ++iconVersionRef.current;
      patchRuntimeAndSnapshot({ icon });
      try {
        await api.pages.update(workspace.id, page.id, { icon });
        syncProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch (error) {
        if (iconVersionRef.current === version) {
          patchRuntimeAndSnapshot({ icon: page.icon });
        }
        reportClientError({
          source: "page.icon-update",
          error,
          context: {
            workspaceId: workspace.id,
            pageId: page.id,
            icon,
          },
        });
      }
    },
    [workspace, page, patchRuntimeAndSnapshot, syncProvider],
  );

  const handleCoverChange = useCallback(
    async (coverUrl: string | null) => {
      if (!workspace || !page) return;
      const version = ++coverVersionRef.current;
      patchRuntimeAndSnapshot({ coverUrl });
      try {
        await api.pages.update(workspace.id, page.id, { cover_url: coverUrl });
        syncProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch (error) {
        if (coverVersionRef.current === version) {
          patchRuntimeAndSnapshot({ coverUrl: page.coverUrl });
        }
        reportClientError({
          source: "page.cover-update",
          error,
          context: {
            workspaceId: workspace.id,
            pageId: page.id,
            hasCover: !!coverUrl,
          },
        });
      }
    },
    [workspace, page, patchRuntimeAndSnapshot, syncProvider],
  );

  return {
    isArchiving,
    handleArchive,
    handleTitleChange,
    handleIconChange,
    handleCoverChange,
  };
}
