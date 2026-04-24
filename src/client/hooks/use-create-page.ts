import { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Page, PageKind } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { api } from "@/client/lib/api";
import { useCurrentWorkspace } from "@/client/components/workspace/use-workspace-view";
import { replicaCommands } from "@/client/stores/db/workspace-replica";
import { useOnline } from "@/client/hooks/use-online";
import { toast } from "@/client/components/toast";

export function useCreatePage() {
  const [isCreating, setIsCreating] = useState(false);
  const busyRef = useRef(false);
  const workspace = useCurrentWorkspace();
  const navigate = useNavigate();
  const online = useOnline();

  const createPage = useCallback(
    async (opts?: { kind?: PageKind; parentId?: string; onCreated?: (page: Page) => void }) => {
      if (!workspace || busyRef.current) return;
      if (!online) {
        toast.info("You're offline");
        return;
      }
      busyRef.current = true;
      setIsCreating(true);
      try {
        const page = await api.pages.create(workspace.id, {
          kind: opts?.kind,
          title: DEFAULT_PAGE_TITLE,
          parent_id: opts?.parentId,
        });
        await replicaCommands.addPage(workspace.id, page);
        opts?.onCreated?.(page);
        navigate({
          to: "/$workspaceSlug/$pageId",
          params: { workspaceSlug: workspace.slug, pageId: page.id },
        });
      } catch {
        toast.error("Failed to create page");
      } finally {
        busyRef.current = false;
        setIsCreating(false);
      }
    },
    [workspace, navigate, online],
  );

  return { createPage, isCreating };
}
