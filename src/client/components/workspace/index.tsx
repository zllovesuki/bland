import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useCurrentWorkspace, useWorkspacePages } from "./use-workspace-view";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useWorkspaceStore } from "@/client/stores/workspace-store";

export function WorkspaceIndex() {
  const currentWorkspace = useCurrentWorkspace();
  const pages = useWorkspacePages();
  const { createPage, isCreating } = useCreatePage();
  const navigate = useNavigate();
  const { workspaceSlug } = useParams({ strict: false }) as { workspaceSlug: string };
  useDocumentTitle(currentWorkspace?.name);

  const activePages = useMemo(() => pages.filter((p) => !p.archived_at), [pages]);
  const hasPages = activePages.length > 0;

  const lastVisitedPageId = useWorkspaceStore((s) =>
    currentWorkspace ? (s.lastVisitedPageIdByWorkspaceId[currentWorkspace.id] ?? null) : null,
  );

  useEffect(() => {
    if (!currentWorkspace || !lastVisitedPageId) return;
    const stillAvailable = activePages.some((p) => p.id === lastVisitedPageId);
    if (!stillAvailable) return;
    navigate({
      to: "/$workspaceSlug/$pageId",
      params: { workspaceSlug, pageId: lastVisitedPageId },
      replace: true,
    });
  }, [currentWorkspace, lastVisitedPageId, activePages, navigate, workspaceSlug]);

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="animate-slide-up max-w-md text-center">
        {hasPages ? (
          <>
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-zinc-100">
              {currentWorkspace?.name ?? "Workspace"}
            </h2>
            <p className="mt-3 text-sm text-zinc-400">Pick a page. Or don't. We're not your boss.</p>
          </>
        ) : (
          <>
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-zinc-100">Blank slate.</h2>
            <p className="mt-3 text-sm text-zinc-400">Your first page is one click away.</p>
            <Button
              variant="primary"
              size="sm"
              className="mt-6"
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
