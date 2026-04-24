import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useWorkspacePages, useWorkspaceRole } from "@/client/components/workspace/use-workspace-view";
import { useOnline } from "@/client/hooks/use-online";
import { buildPageTreeIndex } from "@/client/lib/page-tree-model";
import { PageTreeItem } from "./page-tree-item";

interface PageTreeProps {
  alwaysShowActions?: boolean;
  menuZIndex?: number;
}

const EMPTY_CHILDREN: readonly never[] = [];

export function PageTree({ alwaysShowActions = false, menuZIndex }: PageTreeProps) {
  const pages = useWorkspacePages();
  const params = useParams({ strict: false }) as { pageId?: string };
  const online = useOnline();
  const workspaceRole = useWorkspaceRole() ?? "none";

  const index = useMemo(() => buildPageTreeIndex(pages), [pages]);
  const activePages = index.activePages;

  const activeAncestorIds = useMemo(() => {
    const ids = new Set<string>();
    if (!params.pageId) return ids;
    let cur = index.byId.get(params.pageId);
    while (cur?.parent_id) {
      ids.add(cur.parent_id);
      cur = index.byId.get(cur.parent_id);
    }
    return ids;
  }, [params.pageId, index]);

  const rootPages = index.childrenByParent.get(null) ?? EMPTY_CHILDREN;

  if (activePages.length === 0) {
    return <div className="px-3 py-4 text-center text-xs text-zinc-400">No pages yet</div>;
  }

  return (
    <div className="relative min-h-full space-y-0.5 py-1">
      {rootPages.map((page, i) => (
        <div
          key={page.id}
          className="opacity-0 animate-slide-up"
          style={{ animationDelay: `${Math.min(i, 7) * 60}ms` }}
        >
          <PageTreeItem
            page={page}
            depth={0}
            index={index}
            allPages={activePages}
            alwaysShowActions={alwaysShowActions}
            activeAncestorIds={activeAncestorIds}
            menuZIndex={menuZIndex}
            workspaceRole={workspaceRole}
            online={online}
          />
        </div>
      ))}
    </div>
  );
}
