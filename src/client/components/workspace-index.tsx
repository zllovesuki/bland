import { useParams } from "@tanstack/react-router";
import { FileText, Plus, Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useWorkspaceStore, selectActivePages, selectActiveWorkspace } from "@/client/stores/workspace-store";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { useDocumentTitle } from "@/client/hooks/use-document-title";

export function WorkspaceIndex() {
  const params = useParams({ strict: false }) as { workspaceSlug?: string };
  const pages = useWorkspaceStore(selectActivePages);
  const currentWorkspace = useWorkspaceStore(selectActiveWorkspace);
  const { createPage, isCreating } = useCreatePage();
  useDocumentTitle(currentWorkspace?.name);
  const hasPages = pages.filter((p) => !p.archived_at).length > 0;

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
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => createPage()}
              disabled={isCreating}
              icon={isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            >
              {isCreating ? "Creating..." : "Create first page"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
