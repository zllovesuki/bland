import { useCallback, useRef } from "react";
import type YProvider from "y-partyserver/provider";
import { api } from "@/client/lib/api";
import { reportClientError } from "@/client/lib/report-client-error";
import { replicaCommands } from "@/client/stores/db/workspace-replica";
import type { Workspace } from "@/shared/types";
import type { ActivePagePatch, ActivePageSnapshot } from "@/client/lib/active-page-model";

interface UseCanonicalPageActionsInput {
  workspace: Workspace | null;
  page: ActivePageSnapshot | null;
  syncProvider: YProvider | null;
  patchPage: (updates: ActivePagePatch) => void;
}

export function useCanonicalPageActions({ workspace, page, syncProvider, patchPage }: UseCanonicalPageActionsInput) {
  const iconVersionRef = useRef(0);
  const coverVersionRef = useRef(0);

  const patchRuntimeAndSnapshot = useCallback(
    (updates: ActivePagePatch) => {
      if (!workspace || !page) return;
      patchPage(updates);
      void replicaCommands.patchPage(workspace.id, page.id, {
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
        ...(updates.coverUrl !== undefined ? { cover_url: updates.coverUrl } : {}),
      });
    },
    [workspace, page, patchPage],
  );

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
    handleTitleChange,
    handleIconChange,
    handleCoverChange,
  };
}
