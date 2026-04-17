import { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { api } from "@/client/lib/api";
import { useCurrentWorkspace } from "@/client/components/workspace/use-workspace-view";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useOnline } from "@/client/hooks/use-online";
import { toast } from "@/client/components/toast";

export function useCreatePage() {
  const [isCreating, setIsCreating] = useState(false);
  const busyRef = useRef(false);
  const workspace = useCurrentWorkspace();
  const addPage = useWorkspaceStore((s) => s.addPageToSnapshot);
  const navigate = useNavigate();
  const online = useOnline();

  const createPage = useCallback(
    async (opts?: { parentId?: string; onCreated?: (page: Page) => void }) => {
      if (!workspace || busyRef.current) return;
      if (!online) {
        toast.info("You're offline");
        return;
      }
      busyRef.current = true;
      setIsCreating(true);
      try {
        const page = await api.pages.create(workspace.id, {
          title: DEFAULT_PAGE_TITLE,
          parent_id: opts?.parentId,
        });
        addPage(workspace.id, page);
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
    [workspace, addPage, navigate, online],
  );

  return { createPage, isCreating };
}
