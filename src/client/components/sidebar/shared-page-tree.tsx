import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { api } from "@/client/lib/api";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import type { ShareRootPage } from "@/client/lib/share-page-model";
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

interface TreeState {
  pagesById: Map<string, Page>;
  childrenByParentId: Map<string, string[]>;
  expandedIds: Set<string>;
}

type TreeAction =
  | { type: "children-loaded"; parentId: string; children: Page[] }
  | { type: "expand"; pageId: string }
  | { type: "toggle"; pageId: string };

function createTreeState(): TreeState {
  return {
    pagesById: new Map(),
    childrenByParentId: new Map(),
    expandedIds: new Set(),
  };
}

function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "children-loaded": {
      const pagesById = new Map(state.pagesById);
      const childrenByParentId = new Map(state.childrenByParentId);
      for (const child of action.children) {
        pagesById.set(child.id, child);
      }
      childrenByParentId.set(
        action.parentId,
        action.children.map((child) => child.id),
      );
      return { ...state, pagesById, childrenByParentId };
    }
    case "expand": {
      if (state.expandedIds.has(action.pageId)) return state;
      const expandedIds = new Set(state.expandedIds);
      expandedIds.add(action.pageId);
      return { ...state, expandedIds };
    }
    case "toggle": {
      const expandedIds = new Set(state.expandedIds);
      if (expandedIds.has(action.pageId)) expandedIds.delete(action.pageId);
      else expandedIds.add(action.pageId);
      return { ...state, expandedIds };
    }
  }
}

function isTreeNode(node: TreeNodeData | null): node is TreeNodeData {
  return node !== null;
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
  autoExpandPathIds,
  onNavigate,
}: {
  workspaceId: string;
  rootPage: ShareRootPage;
  shareToken: string;
  activePageId: string;
  autoExpandPathIds: string[];
  onNavigate: (pageId: string) => void;
}) {
  return (
    <SharedPageTreeForScope
      key={`${workspaceId}:${shareToken}:${rootPage.id}`}
      workspaceId={workspaceId}
      rootPage={rootPage}
      shareToken={shareToken}
      activePageId={activePageId}
      autoExpandPathIds={autoExpandPathIds}
      onNavigate={onNavigate}
    />
  );
}

function SharedPageTreeForScope({
  workspaceId,
  rootPage,
  shareToken,
  activePageId,
  autoExpandPathIds,
  onNavigate,
}: {
  workspaceId: string;
  rootPage: ShareRootPage;
  shareToken: string;
  activePageId: string;
  autoExpandPathIds: string[];
  onNavigate: (pageId: string) => void;
}) {
  const [treeState, dispatch] = useReducer(treeReducer, undefined, createTreeState);
  const lastAutoExpandPathKeyRef = useRef<string | null>(null);
  const autoExpandPathKey = autoExpandPathIds.join("\u0000");
  const rootChildIds = treeState.childrenByParentId.get(rootPage.id) ?? null;

  const nodesById = useMemo(() => {
    const map = new Map<string, TreeNodeData>();
    function toNode(pageId: string): TreeNodeData | null {
      const page = treeState.pagesById.get(pageId);
      if (!page) return null;
      const childIds = treeState.childrenByParentId.get(page.id) ?? null;
      let children: TreeNodeData[] | null = null;
      if (childIds) {
        children = childIds.map(toNode).filter(isTreeNode);
      }
      const expanded = treeState.expandedIds.has(page.id);
      const node = { page, children, expanded };
      map.set(page.id, node);
      return node;
    }
    for (const childId of rootChildIds ?? []) {
      toNode(childId);
    }
    return map;
  }, [rootChildIds, treeState]);

  const loadChildren = useCallback(
    async (parentId: string) => {
      try {
        const children = await api.pages.children(workspaceId, parentId, shareToken);
        dispatch({ type: "children-loaded", parentId, children });
        return children;
      } catch {
        return [];
      }
    },
    [shareToken, workspaceId],
  );

  const getLoadedChildIds = useEffectEvent((parentId: string) => treeState.childrenByParentId.get(parentId) ?? null);

  useEffect(() => {
    void loadChildren(rootPage.id);
  }, [loadChildren, rootPage.id]);

  useEffect(() => {
    if (rootChildIds === null) return;
    if (lastAutoExpandPathKeyRef.current === autoExpandPathKey) return;
    if (!autoExpandPathKey) {
      lastAutoExpandPathKeyRef.current = autoExpandPathKey;
      return;
    }

    let cancelled = false;

    async function expandActivePath() {
      let visibleChildIds: readonly string[] = rootChildIds ?? [];

      for (const pageId of autoExpandPathIds) {
        if (cancelled) return;
        if (!visibleChildIds.includes(pageId)) return;

        dispatch({ type: "expand", pageId });

        let childIds = getLoadedChildIds(pageId);
        if (!childIds) {
          const children = await loadChildren(pageId);
          if (cancelled) return;
          childIds = children.map((child) => child.id);
        }
        visibleChildIds = childIds;
      }
    }

    void expandActivePath().finally(() => {
      if (!cancelled) {
        lastAutoExpandPathKeyRef.current = autoExpandPathKey;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [autoExpandPathIds, autoExpandPathKey, loadChildren, rootChildIds]);

  const handleToggle = useCallback(
    (pageId: string) => {
      const childrenLoaded = treeState.childrenByParentId.has(pageId);
      dispatch({ type: "toggle", pageId });
      if (!childrenLoaded) {
        void loadChildren(pageId);
      }
    },
    [loadChildren, treeState.childrenByParentId],
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
      {rootChildIds === null ? (
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
        rootChildIds.map((id) => {
          const node = nodesById.get(id);
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
