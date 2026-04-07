import { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@/client/lib/api";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { toast } from "@/client/components/toast";

export function useCreateWorkspace() {
  const [isCreating, setIsCreating] = useState(false);
  const busyRef = useRef(false);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const navigate = useNavigate();

  const createWorkspace = useCallback(
    async (name: string, slug: string, onCreated?: () => void) => {
      if (!name.trim() || !slug.trim() || busyRef.current) return;
      busyRef.current = true;
      setIsCreating(true);
      try {
        const ws = await api.workspaces.create({ name: name.trim(), slug: slug.trim() });
        addWorkspace(ws);
        onCreated?.();
        navigate({ to: "/$workspaceSlug", params: { workspaceSlug: ws.slug } });
      } catch {
        toast.error("Failed to create workspace");
      } finally {
        busyRef.current = false;
        setIsCreating(false);
      }
    },
    [addWorkspace, navigate],
  );

  return { createWorkspace, isCreating };
}
