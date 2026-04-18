import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type YProvider from "y-partyserver/provider";
import { api } from "@/client/lib/api";
import { confirm } from "@/client/components/confirm";
import { toast } from "@/client/components/toast";
import { getArchivePageConfirmMessage } from "@/client/lib/page-archive";
import { reportClientError } from "@/client/lib/report-client-error";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import type { Page, Workspace } from "@/shared/types";

interface UseCanonicalPageActionsInput {
  workspace: Workspace | null;
  page: (Page & { can_edit?: boolean }) | null;
  workspaceSlug: string;
  directChildCount: number;
  wsProvider: YProvider | null;
  patchPage: (updates: Partial<Page & { can_edit?: boolean }>) => void;
}

export function useCanonicalPageActions({
  workspace,
  page,
  workspaceSlug,
  directChildCount,
  wsProvider,
  patchPage,
}: UseCanonicalPageActionsInput) {
  const navigate = useNavigate();
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);
  const archivePage = useWorkspaceStore((s) => s.archivePageInSnapshot);
  const [isArchiving, setIsArchiving] = useState(false);
  const iconVersionRef = useRef(0);
  const coverVersionRef = useRef(0);

  const patchRuntimeAndSnapshot = useCallback(
    (updates: Partial<Page>) => {
      if (!workspace || !page) return;
      patchPage(updates);
      updatePage(workspace.id, page.id, updates);
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
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
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
    [workspace, page, patchRuntimeAndSnapshot, wsProvider],
  );

  const handleCoverChange = useCallback(
    async (cover_url: string | null) => {
      if (!workspace || !page) return;
      const version = ++coverVersionRef.current;
      patchRuntimeAndSnapshot({ cover_url });
      try {
        await api.pages.update(workspace.id, page.id, { cover_url });
        wsProvider?.sendMessage(JSON.stringify({ type: "page-metadata-refresh" }));
      } catch (error) {
        if (coverVersionRef.current === version) {
          patchRuntimeAndSnapshot({ cover_url: page.cover_url });
        }
        reportClientError({
          source: "page.cover-update",
          error,
          context: {
            workspaceId: workspace.id,
            pageId: page.id,
            hasCover: !!cover_url,
          },
        });
      }
    },
    [workspace, page, patchRuntimeAndSnapshot, wsProvider],
  );

  return {
    isArchiving,
    handleArchive,
    handleTitleChange,
    handleIconChange,
    handleCoverChange,
  };
}
