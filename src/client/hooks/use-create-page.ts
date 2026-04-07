import { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { api } from "@/client/lib/api";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useOnline } from "@/client/hooks/use-online";
import { toast } from "@/client/components/toast";

export function useCreatePage() {
  const [isCreating, setIsCreating] = useState(false);
  const busyRef = useRef(false);
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const addPage = useWorkspaceStore((s) => s.addPage);
  const navigate = useNavigate();
  const online = useOnline();

  const createPage = useCallback(
    async (opts?: { parentId?: string; onCreated?: (page: Page) => void }) => {
      if (!currentWorkspace || busyRef.current) return;
      if (!online) {
        toast.info("You're offline");
        return;
      }
      busyRef.current = true;
      setIsCreating(true);
      try {
        const page = await api.pages.create(currentWorkspace.id, {
          title: DEFAULT_PAGE_TITLE,
          parent_id: opts?.parentId,
        });
        addPage(page);
        opts?.onCreated?.(page);
        navigate({
          to: "/$workspaceSlug/$pageId",
          params: { workspaceSlug: currentWorkspace.slug, pageId: page.id },
        });
      } catch {
        toast.error("Failed to create page");
      } finally {
        busyRef.current = false;
        setIsCreating(false);
      }
    },
    [currentWorkspace, addPage, navigate, online],
  );

  return { createPage, isCreating };
}
