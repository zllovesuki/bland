import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useCurrentWorkspace, useWorkspacePages, useWorkspaceRole } from "./use-workspace-view";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { useDocumentTitle } from "@/client/hooks/use-document-title";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useOnline } from "@/client/hooks/use-online";
import { deriveSidebarBaseAffordance } from "@/client/lib/affordance/sidebar";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";

export function WorkspaceIndex() {
  const currentWorkspace = useCurrentWorkspace();
  const pages = useWorkspacePages();
  const workspaceRole = useWorkspaceRole();
  const online = useOnline();
  const { createPage, isCreating } = useCreatePage();
  const navigate = useNavigate();
  const { workspaceSlug } = useParams({ strict: false }) as { workspaceSlug: string };
  useDocumentTitle(currentWorkspace?.name);

  const activePages = useMemo(() => pages.filter((p) => !p.archived_at), [pages]);
  const hasPages = activePages.length > 0;

  // Role-aware create affordance — mirrors the sidebar's own gating so guests
  // and non-members see a read-only empty state instead of a CTA the worker
  // will reject.
  const { createPage: createPageAffordance } = deriveSidebarBaseAffordance({
    workspaceRole: workspaceRole ?? "none",
    online,
  });
  const canCreate = isActionVisible(createPageAffordance);

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
        ) : canCreate ? (
          <>
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-zinc-100">Blank slate.</h2>
            <p className="mt-3 text-sm text-zinc-400">Your first page is one click away.</p>
            <Button
              variant="primary"
              size="sm"
              className="mt-6"
              onClick={() => createPage()}
              disabled={isCreating || !isActionEnabled(createPageAffordance)}
              icon={isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            >
              {isCreating ? "Creating..." : "Create first page"}
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-zinc-100">Nothing here yet.</h2>
            <p className="mt-3 text-sm text-zinc-400">
              When pages are shared with you, they'll show up in the sidebar.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
