import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { api } from "@/client/lib/api";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import type { ShareRootPage } from "@/client/components/share/use-share-view";
import {
  getSidebarTreeChevronLeft,
  getSidebarTreeContentPaddingLeft,
  getSidebarTreeStandalonePaddingLeft,
} from "./tree-metrics";

interface TreeNodeData {
  page: Page;
  children: TreeNodeData[] | null; // null = not loaded
  expanded: boolean;
}

function TreeNode({
  node,
  depth,
  activePageId,
  onNavigate,
  onToggle,
}: {
  node: TreeNodeData;
  depth: number;
  activePageId: string;
  onNavigate: (pageId: string) => void;
  onToggle: (pageId: string) => void;
}) {
  const isActive = node.page.id === activePageId;
  const showChevron = node.children === null || node.children.length > 0;
  const rowPaddingLeft = getSidebarTreeContentPaddingLeft(depth);
  const chevronLeft = getSidebarTreeChevronLeft(depth);

  return (
    <div>
      <div
        className={`relative flex h-8 w-full items-center gap-1 rounded-md text-sm transition-colors ${
          isActive ? "bg-accent-500/10 text-accent-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: rowPaddingLeft }}
      >
        {showChevron && (
          <button
            onClick={() => onToggle(node.page.id)}
            className="absolute top-1/2 flex h-5 w-4 -translate-y-1/2 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
            style={{ left: chevronLeft }}
            aria-label={node.expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${node.expanded ? "rotate-90" : ""}`} />
          </button>
        )}
        <button onClick={() => onNavigate(node.page.id)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs">
            {node.page.icon ? <EmojiIcon emoji={node.page.icon} size={14} /> : <FileText className="h-3.5 w-3.5" />}
          </span>
          <span className="truncate">{node.page.title || DEFAULT_PAGE_TITLE}</span>
        </button>
      </div>
      {node.expanded &&
        (node.children === null ? (
          <div className="space-y-1 py-0.5" style={{ paddingLeft: getSidebarTreeContentPaddingLeft(depth + 1) }}>
            <div className="flex h-8 items-center gap-1">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
            <div className="flex h-8 items-center gap-1">
              <Skeleton className="h-5 w-5 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
        ) : (
          node.children.map((child) => (
            <TreeNode
              key={child.page.id}
              node={child}
              depth={depth + 1}
              activePageId={activePageId}
              onNavigate={onNavigate}
              onToggle={onToggle}
            />
          ))
        ))}
    </div>
  );
}

export function SharedPageTree({
  workspaceId,
  rootPage,
  shareToken,
  activePageId,
  onNavigate,
}: {
  workspaceId: string;
  rootPage: ShareRootPage;
  shareToken: string;
  activePageId: string;
  onNavigate: (pageId: string) => void;
}) {
  const [nodes, setNodes] = useState<Map<string, TreeNodeData>>(() => new Map());
  const [rootChildren, setRootChildren] = useState<string[] | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Reset tree state when the root page changes (e.g. navigating to a different shared link)
  useEffect(() => {
    setNodes(new Map());
    setRootChildren(null);
  }, [rootPage.id, shareToken]);

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
    loadChildren(rootPage.id).then((children) => {
      setRootChildren(children.map((c) => c.id));
    });
  }, [rootChildren, rootPage.id, loadChildren]);

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

      const node = nodesRef.current.get(pageId);
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
    [loadChildren],
  );

  return (
    <nav className="w-[260px] shrink-0 overflow-y-auto border-r border-zinc-800/60 bg-zinc-900 px-2 py-4">
      <button
        onClick={() => onNavigate(rootPage.id)}
        className={`mb-1 flex h-8 w-full items-center gap-1 rounded-md text-left text-sm font-medium transition-colors ${
          activePageId === rootPage.id
            ? "bg-accent-500/10 text-accent-400"
            : "text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: getSidebarTreeStandalonePaddingLeft(0) }}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs">
          {rootPage.icon ? <EmojiIcon emoji={rootPage.icon} size={14} /> : <FileText className="h-3.5 w-3.5" />}
        </span>
        <span className="truncate">{rootPage.title || DEFAULT_PAGE_TITLE}</span>
      </button>
      {rootChildren === null ? (
        <div className="space-y-1 px-2 pt-1">
          <div className="flex h-8 items-center gap-1">
            <Skeleton className="h-5 w-5 shrink-0 rounded" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
          <div className="flex h-8 items-center gap-1">
            <Skeleton className="h-5 w-5 shrink-0 rounded" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
      ) : (
        rootChildren.map((id) => {
          const node = nodes.get(id);
          if (!node) return null;
          return (
            <TreeNode
              key={id}
              node={node}
              depth={0}
              activePageId={activePageId}
              onNavigate={onNavigate}
              onToggle={handleToggle}
            />
          );
        })
      )}
    </nav>
  );
}
