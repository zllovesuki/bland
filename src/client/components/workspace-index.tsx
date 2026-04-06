import { useCallback, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { FileText, Plus, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";

export function WorkspaceIndex() {
  const params = useParams({ strict: false }) as { workspaceSlug?: string };
  const navigate = useNavigate();
  const pages = useWorkspaceStore((s) => s.pages);
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const addPage = useWorkspaceStore((s) => s.addPage);
  const [isCreating, setIsCreating] = useState(false);
  const hasPages = pages.filter((p) => !p.archived_at).length > 0;

  const handleCreate = useCallback(async () => {
    if (!currentWorkspace || isCreating) return;
    setIsCreating(true);
    try {
      const page = await api.pages.create(currentWorkspace.id, {
        title: DEFAULT_PAGE_TITLE,
      });
      addPage(page);
      navigate({
        to: "/$workspaceSlug/$pageId",
        params: { workspaceSlug: currentWorkspace.slug, pageId: page.id },
      });
    } catch {
      // Silently fail
    } finally {
      setIsCreating(false);
    }
  }, [currentWorkspace, isCreating, addPage, navigate]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-slide-up text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50">
          <FileText className="h-8 w-8 text-zinc-600" />
        </div>

        {hasPages ? (
          <>
            <h2 className="text-lg font-semibold text-zinc-200">{currentWorkspace?.name ?? "Workspace"}</h2>
            <p className="mt-1 text-sm text-zinc-500">Select a page from the sidebar to get started</p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-zinc-200">No pages yet</h2>
            <p className="mt-1 text-sm text-zinc-500">Create your first page to get started</p>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isCreating ? "Creating..." : "Create first page"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
