import { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@/client/lib/api";
import { directoryCommands } from "@/client/stores/db/workspace-directory";
import { toast } from "@/client/components/toast";

export function useCreateWorkspace() {
  const [isCreating, setIsCreating] = useState(false);
  const busyRef = useRef(false);
  const navigate = useNavigate();

  const createWorkspace = useCallback(
    async (name: string, slug: string, onCreated?: () => void) => {
      if (!name.trim() || !slug.trim() || busyRef.current) return;
      busyRef.current = true;
      setIsCreating(true);
      try {
        const ws = await api.workspaces.create({ name: name.trim(), slug: slug.trim() });
        // POST /workspaces makes the caller the owner, so inject that into the
        // membership summary we cache locally.
        await directoryCommands.upsert({ ...ws, role: "owner" });
        onCreated?.();
        navigate({ to: "/$workspaceSlug", params: { workspaceSlug: ws.slug } });
      } catch {
        toast.error("Failed to create workspace");
      } finally {
        busyRef.current = false;
        setIsCreating(false);
      }
    },
    [navigate],
  );

  return { createWorkspace, isCreating };
}
