import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { PageTreeItem } from "./page-tree-item";

export function PageTree() {
  const pages = useWorkspaceStore((s) => s.pages);
  const params = useParams({ strict: false }) as { pageId?: string };

  const activePages = pages.filter((p) => !p.archived_at).sort((a, b) => a.position - b.position);

  const activeAncestorIds = useMemo(() => {
    const ids = new Set<string>();
    if (!params.pageId) return ids;
    const byId = new Map(activePages.map((p) => [p.id, p]));
    let cur = byId.get(params.pageId);
    while (cur?.parent_id) {
      ids.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
    return ids;
  }, [params.pageId, activePages]);

  const rootPages = activePages.filter((p) => p.parent_id === null);

  if (activePages.length === 0) {
    return <div className="px-3 py-4 text-center text-xs text-zinc-600">No pages yet</div>;
  }

  return (
    <div className="space-y-0.5 py-1">
      {rootPages.map((page) => (
        <PageTreeItem
          key={page.id}
          page={page}
          depth={0}
          childPages={activePages.filter((p) => p.parent_id === page.id)}
          allPages={activePages}
          activeAncestorIds={activeAncestorIds}
        />
      ))}
    </div>
  );
}
