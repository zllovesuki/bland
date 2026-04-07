import { useState, useCallback, useEffect } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { api } from "@/client/lib/api";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";

interface TreeNodeData {
  page: Page;
  children: TreeNodeData[] | null; // null = not loaded
  expanded: boolean;
}

function TreeNode({
  node,
  depth,
  activePageId,
  shareToken,
  workspaceId,
  onNavigate,
  onToggle,
}: {
  node: TreeNodeData;
  depth: number;
  activePageId: string;
  shareToken: string;
  workspaceId: string;
  onNavigate: (pageId: string) => void;
  onToggle: (pageId: string) => void;
}) {
  const isActive = node.page.id === activePageId;

  return (
    <div>
      <div
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-sm transition ${
          isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={() => onToggle(node.page.id)}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-zinc-300"
          aria-label={node.expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${node.expanded ? "rotate-90" : ""} ${
              node.children !== null && node.children.length === 0 ? "opacity-0" : ""
            }`}
          />
        </button>
        <button onClick={() => onNavigate(node.page.id)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="shrink-0">
            {node.page.icon ? <span className="text-sm">{node.page.icon}</span> : <FileText className="h-3.5 w-3.5" />}
          </span>
          <span className="truncate">{node.page.title || DEFAULT_PAGE_TITLE}</span>
        </button>
      </div>
      {node.expanded &&
        node.children?.map((child) => (
          <TreeNode
            key={child.page.id}
            node={child}
            depth={depth + 1}
            activePageId={activePageId}
            shareToken={shareToken}
            workspaceId={workspaceId}
            onNavigate={onNavigate}
            onToggle={onToggle}
          />
        ))}
    </div>
  );
}

export function SharedPageTree({
  workspaceId,
  rootPageId,
  rootTitle,
  rootIcon,
  shareToken,
  activePageId,
  onNavigate,
}: {
  workspaceId: string;
  rootPageId: string;
  rootTitle: string;
  rootIcon: string | null;
  shareToken: string;
  activePageId: string;
  onNavigate: (pageId: string) => void;
}) {
  const [nodes, setNodes] = useState<Map<string, TreeNodeData>>(() => new Map());
  const [rootChildren, setRootChildren] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset tree state when the root page changes (e.g. navigating to a different shared link)
  useEffect(() => {
    setNodes(new Map());
    setRootChildren(null);
    setLoading(false);
  }, [rootPageId, shareToken]);

  const loadChildren = useCallback(
    async (parentId: string) => {
      try {
        const children = await api.pages.children(workspaceId, parentId, shareToken);
        setNodes((prev) => {
          const next = new Map(prev);
          for (const child of children) {
            const existing = next.get(child.id);
            if (existing) {
              existing.page = child;
            } else {
              next.set(child.id, { page: child, children: null, expanded: false });
            }
          }
          // Update parent's children list
          const parent = next.get(parentId);
          if (parent) {
            parent.children = children.map((c) => next.get(c.id)!);
          }
          return next;
        });
        return children;
      } catch {
        return [];
      }
    },
    [workspaceId, shareToken],
  );

  useEffect(() => {
    if (rootChildren !== null) return;
    setLoading(true);
    loadChildren(rootPageId).then((children) => {
      setRootChildren(children.map((c) => c.id));
      setLoading(false);
    });
  }, [rootPageId, loadChildren]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = useCallback(
    async (pageId: string) => {
      setNodes((prev) => {
        const next = new Map(prev);
        const node = next.get(pageId);
        if (node) {
          node.expanded = !node.expanded;
        }
        return next;
      });

      // Load children if not yet loaded
      const node = nodes.get(pageId);
      if (node && node.children === null) {
        const children = await loadChildren(pageId);
        setNodes((prev) => {
          const next = new Map(prev);
          const n = next.get(pageId);
          if (n) {
            n.children = children.map((c) => next.get(c.id)!);
            n.expanded = true;
          }
          return next;
        });
      }
    },
    [nodes, loadChildren],
  );

  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-zinc-800/50 px-2 py-4">
      <button
        onClick={() => onNavigate(rootPageId)}
        className={`mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm font-medium transition ${
          activePageId === rootPageId ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800/50"
        }`}
      >
        {rootIcon ? <span>{rootIcon}</span> : <FileText className="h-3.5 w-3.5" />}
        <span className="truncate">{rootTitle || DEFAULT_PAGE_TITLE}</span>
      </button>
      {rootChildren === null ? (
        <div className="space-y-1 px-2 pt-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        rootChildren.map((id) => {
          const node = nodes.get(id);
          if (!node) return null;
          return (
            <TreeNode
              key={id}
              node={node}
              depth={1}
              activePageId={activePageId}
              shareToken={shareToken}
              workspaceId={workspaceId}
              onNavigate={onNavigate}
              onToggle={handleToggle}
            />
          );
        })
      )}
    </nav>
  );
}
