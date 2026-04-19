import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, FileText, Search } from "lucide-react";
import { Dialog } from "@/client/components/ui/dialog";
import { Button } from "@/client/components/ui/button";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import {
  buildPageMap,
  getAncestorIds,
  resolveMoveRelative,
  resolveMoveToRoot,
  type MoveRelation,
  type MoveResult,
} from "@/client/lib/page-tree-model";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import type { Page } from "@/shared/types";

interface SidebarMoveDialogProps {
  open: boolean;
  page: Page;
  allPages: Page[];
  onClose: () => void;
  onConfirm: (result: Extract<MoveResult, { ok: true }>) => Promise<void>;
}

type TargetSelection = { kind: "root" } | { kind: "page"; pageId: string } | null;

interface TreeNode {
  page: Page;
  children: TreeNode[];
}

const PAGE_RELATIONS = ["before", "inside", "after"] as const;
const ROOT_RELATIONS = ["root-top", "root-bottom"] as const;

const RELATION_LABEL: Record<MoveRelation, string> = {
  before: "Before",
  inside: "Inside",
  after: "After",
  "root-top": "At top",
  "root-bottom": "At bottom",
};

const INDENT_BASE_PX = 20;
const INDENT_PER_DEPTH_PX = 16;
const CHEVRON_COLUMN_PX = 20;
const CHIP_OFFSET_PX = 48;

function buildTree(pages: Page[]): TreeNode[] {
  const active = pages.filter((candidate) => !candidate.archived_at);
  const byParent = new Map<string | null, Page[]>();
  for (const candidate of active) {
    const arr = byParent.get(candidate.parent_id) ?? [];
    arr.push(candidate);
    byParent.set(candidate.parent_id, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position);
  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? []).map((candidate) => ({ page: candidate, children: build(candidate.id) }));
  return build(null);
}

export function SidebarMoveDialog({ open, page, allPages, onClose, onConfirm }: SidebarMoveDialogProps) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<TargetSelection>(null);
  const [relation, setRelation] = useState<MoveRelation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualExpand, setManualExpand] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTarget(null);
    setRelation(null);
    setSubmitting(false);
    setManualExpand({});
  }, [open, page.id]);

  const byId = useMemo(() => buildPageMap(allPages), [allPages]);
  const tree = useMemo(() => buildTree(allPages), [allPages]);

  const movingSubtreeIds = useMemo(() => {
    const result = new Set<string>();
    for (const candidate of allPages) {
      if (candidate.archived_at || candidate.id === page.id) continue;
      if (getAncestorIds(byId, candidate.id).has(page.id)) result.add(candidate.id);
    }
    return result;
  }, [allPages, byId, page.id]);

  const isSearchActive = query.trim().length > 0;

  const { matches, visibleIds } = useMemo(() => {
    if (!isSearchActive) return { matches: null as Set<string> | null, visibleIds: null as Set<string> | null };
    const needle = query.trim().toLowerCase();
    const hits = new Set<string>();
    const visible = new Set<string>();
    for (const candidate of allPages) {
      if (candidate.archived_at) continue;
      if (candidate.id === page.id) continue;
      if (movingSubtreeIds.has(candidate.id)) continue;
      if (candidate.title.toLowerCase().includes(needle)) {
        hits.add(candidate.id);
        visible.add(candidate.id);
        for (const id of getAncestorIds(byId, candidate.id)) visible.add(id);
      }
    }
    return { matches: hits, visibleIds: visible };
  }, [allPages, byId, isSearchActive, movingSubtreeIds, page.id, query]);

  const effectiveTarget = useMemo<TargetSelection>(() => {
    if (!target) return null;
    if (target.kind === "root") return isSearchActive ? null : target;
    if (visibleIds && !visibleIds.has(target.pageId)) return null;
    return target;
  }, [isSearchActive, target, visibleIds]);

  const autoExpandIds = useMemo(() => {
    const result = new Set<string>();
    for (const id of getAncestorIds(byId, page.id)) result.add(id);
    if (effectiveTarget?.kind === "page") {
      for (const id of getAncestorIds(byId, effectiveTarget.pageId)) result.add(id);
    }
    if (matches) {
      for (const id of matches) {
        for (const anc of getAncestorIds(byId, id)) result.add(anc);
      }
    }
    return result;
  }, [byId, effectiveTarget, matches, page.id]);

  const isExpanded = useCallback(
    (id: string): boolean => (id in manualExpand ? manualExpand[id] : autoExpandIds.has(id)),
    [autoExpandIds, manualExpand],
  );
  const toggleNode = useCallback(
    (id: string) =>
      setManualExpand((prev) => {
        const was = id in prev ? prev[id] : autoExpandIds.has(id);
        return { ...prev, [id]: !was };
      }),
    [autoExpandIds],
  );

  const selectedPage = effectiveTarget?.kind === "page" ? (byId.get(effectiveTarget.pageId) ?? null) : null;
  const relationResults = useMemo(() => {
    if (!effectiveTarget) return [];
    if (effectiveTarget.kind === "root") {
      return ROOT_RELATIONS.map((candidate) => ({
        relation: candidate as MoveRelation,
        label: RELATION_LABEL[candidate],
        result: resolveMoveToRoot(allPages, page, candidate === "root-top" ? "top" : "bottom"),
      }));
    }
    if (!selectedPage) return [];
    return PAGE_RELATIONS.map((candidate) => ({
      relation: candidate as MoveRelation,
      label: RELATION_LABEL[candidate],
      result: resolveMoveRelative({ allPages, page, targetPage: selectedPage, relation: candidate }),
    }));
  }, [allPages, effectiveTarget, page, selectedPage]);

  const selectedRelation = relation
    ? (relationResults.find((candidate) => candidate.relation === relation) ?? null)
    : null;
  const selectedResolution = selectedRelation?.result ?? null;

  const selectTarget = useCallback((next: TargetSelection) => {
    setTarget(next);
    setRelation(null);
  }, []);

  const handleConfirm = async () => {
    if (!selectedResolution || !selectedResolution.ok || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedResolution);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const footerStatus: ReactNode = (() => {
    if (selectedResolution?.ok) {
      return <span className="text-zinc-300">{selectedResolution.proposal.previewLabel}</span>;
    }
    if (selectedResolution && !selectedResolution.ok) {
      return <span className="text-amber-400/90">{selectedResolution.message}</span>;
    }
    if (effectiveTarget) return <span>Pick where it goes.</span>;
    return <span>Pick a target, then where it goes.</span>;
  })();

  const treeHasResults = !isSearchActive || (visibleIds?.size ?? 0) > 0;

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const id = node.page.id;
      const isMoving = id === page.id;
      const isInMovingSubtree = movingSubtreeIds.has(id);
      const isSelectable = !isMoving && !isInMovingSubtree;

      if (isSearchActive) {
        if (isMoving || isInMovingSubtree) return null;
        if (visibleIds && !visibleIds.has(id)) return null;
      }

      const isSelected = effectiveTarget?.kind === "page" && effectiveTarget.pageId === id;
      const hasChildren = node.children.length > 0;
      const expanded = isExpanded(id);
      const isMatch = matches?.has(id) ?? false;
      const rowState: TreeRowState = isMoving
        ? "moving"
        : isInMovingSubtree
          ? "blocked"
          : isSelected
            ? "selected"
            : "selectable";

      return (
        <div key={id}>
          <TreeRow
            label={node.page.title || DEFAULT_PAGE_TITLE}
            depth={depth}
            icon={
              node.page.icon ? (
                <EmojiIcon emoji={node.page.icon} size={14} />
              ) : (
                <FileText className="h-3.5 w-3.5 text-zinc-500" />
              )
            }
            hasChildren={hasChildren}
            expanded={expanded}
            onToggle={() => toggleNode(id)}
            state={rowState}
            emphasized={isMatch}
            onSelect={() => isSelectable && selectTarget({ kind: "page", pageId: id })}
          />
          {isSelected && (
            <PlacementChips depth={depth} relations={relationResults} selected={relation} onSelect={setRelation} />
          )}
          {expanded && hasChildren && renderNodes(node.children, depth + 1)}
        </div>
      );
    });

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => {} : onClose}
      ariaLabelledBy="sidebar-move-dialog-title"
      className="flex w-full max-w-lg flex-col overflow-hidden max-h-[min(640px,85vh)]"
    >
      <div className="flex items-baseline justify-between gap-4 px-5 pt-5">
        <h2
          id="sidebar-move-dialog-title"
          className="min-w-0 truncate text-[15px] font-medium tracking-tight text-zinc-100"
        >
          Move <span className="text-zinc-400">&ldquo;{page.title || DEFAULT_PAGE_TITLE}&rdquo;</span>
        </h2>
        <kbd className="shrink-0 font-mono text-[11px] text-zinc-600">esc</kbd>
      </div>

      <label className="mt-3 flex items-center gap-2.5 border-b border-zinc-700/60 px-5 pb-3">
        <Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a page…"
          aria-label="Find a page to move near"
          className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {!isSearchActive && (
          <>
            <TopLevelRow selected={effectiveTarget?.kind === "root"} onSelect={() => selectTarget({ kind: "root" })} />
            {effectiveTarget?.kind === "root" && (
              <PlacementChips depth={0} relations={relationResults} selected={relation} onSelect={setRelation} />
            )}
            <div className="mx-5 my-1 h-px bg-zinc-700/40" aria-hidden="true" />
          </>
        )}
        {treeHasResults ? (
          renderNodes(tree, 0)
        ) : (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">No page matches that.</div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-zinc-700/60 px-5 py-3">
        <div className="min-w-0 flex-1 truncate text-xs text-zinc-500">{footerStatus}</div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={!selectedResolution || !selectedResolution.ok}
            onClick={handleConfirm}
          >
            Move
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type TreeRowState = "selectable" | "selected" | "moving" | "blocked";

interface TreeRowProps {
  label: string;
  depth: number;
  icon: ReactNode;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  state: TreeRowState;
  emphasized: boolean;
  onSelect: () => void;
}

function TreeRow({ label, depth, icon, hasChildren, expanded, onToggle, state, emphasized, onSelect }: TreeRowProps) {
  const indent = INDENT_BASE_PX + depth * INDENT_PER_DEPTH_PX;
  const selected = state === "selected";
  const selectable = state === "selectable" || state === "selected";
  const muted = state === "moving" || state === "blocked";
  const movingMarker = state === "moving";
  return (
    <div
      className={`flex items-stretch transition-colors ${
        selected ? "bg-zinc-700/25" : selectable ? "hover:bg-zinc-700/15" : ""
      }`}
      style={{ paddingLeft: indent }}
    >
      <span className="flex shrink-0 items-center py-1.5" style={{ width: CHEVRON_COLUMN_PX }}>
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex h-4 w-4 items-center justify-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
            aria-label={expanded ? "Collapse" : "Expand"}
            tabIndex={-1}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}
      </span>
      <button
        type="button"
        onClick={onSelect}
        disabled={!selectable}
        aria-pressed={selected}
        className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-5 text-left outline-none focus-visible:bg-zinc-700/30 ${
          selectable ? "" : "cursor-not-allowed"
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            muted ? "text-zinc-500" : emphasized ? "font-medium text-zinc-100" : "text-zinc-200"
          }`}
        >
          {label}
        </span>
        {movingMarker && <span className="shrink-0 text-xs italic text-zinc-500">moving</span>}
      </button>
    </div>
  );
}

interface TopLevelRowProps {
  selected: boolean;
  onSelect: () => void;
}

function TopLevelRow({ selected, onSelect }: TopLevelRowProps) {
  return (
    <div
      className={`flex items-stretch transition-colors ${selected ? "bg-zinc-700/25" : "hover:bg-zinc-700/15"}`}
      style={{ paddingLeft: INDENT_BASE_PX }}
    >
      <span className="flex shrink-0 items-center py-1.5" style={{ width: CHEVRON_COLUMN_PX }} aria-hidden="true" />
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-5 text-left outline-none focus-visible:bg-zinc-700/30"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
          <span className="h-[1.5px] w-3 rounded-full bg-zinc-500" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">Top level</span>
        <span className="shrink-0 text-xs text-zinc-500">No parent</span>
      </button>
    </div>
  );
}

interface PlacementChipsProps {
  depth: number;
  relations: { relation: MoveRelation; label: string; result: MoveResult }[];
  selected: MoveRelation | null;
  onSelect: (relation: MoveRelation) => void;
}

function PlacementChips({ depth, relations, selected, onSelect }: PlacementChipsProps) {
  const pl = INDENT_BASE_PX + depth * INDENT_PER_DEPTH_PX + CHIP_OFFSET_PX;
  return (
    <div
      role="group"
      aria-label="Placement"
      className="flex items-center gap-0.5 pb-2.5 pr-5"
      style={{ paddingLeft: pl }}
    >
      {relations.map(({ relation, label, result }) => {
        const active = selected === relation;
        const disabled = !result.ok;
        return (
          <button
            key={relation}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={disabled ? result.message : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(relation);
            }}
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              disabled
                ? "cursor-not-allowed text-zinc-600"
                : active
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-100"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
