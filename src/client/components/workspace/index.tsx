import { FileText, Plus, Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useCurrentWorkspace, useWorkspacePages } from "./use-workspace-view";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { useDocumentTitle } from "@/client/hooks/use-document-title";

export function WorkspaceIndex() {
  const currentWorkspace = useCurrentWorkspace();
  const pages = useWorkspacePages();
  const { createPage, isCreating } = useCreatePage();
  useDocumentTitle(currentWorkspace?.name);

  const hasPages = pages.filter((p) => !p.archived_at).length > 0;

  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-slide-up text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50">
          <FileText className="h-8 w-8 text-zinc-500" />
        </div>

        {hasPages ? (
          <>
            <h2 className="text-lg font-semibold text-zinc-200">{currentWorkspace?.name ?? "Workspace"}</h2>
            <p className="mt-1 text-sm text-zinc-400">Pick a page. Or don't. We're not your boss.</p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-zinc-200">Blank slate</h2>
            <p className="mt-1 text-sm text-zinc-400">Your first page is one click away.</p>
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
