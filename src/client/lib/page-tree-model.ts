import { DEFAULT_PAGE_TITLE, MAX_TREE_DEPTH } from "@/shared/constants";
import type { Page } from "@/shared/types";

export type MoveKind = "reorder" | "indent" | "outdent" | "to_root" | "into_parent";
export type MoveRelation = "before" | "inside" | "after" | "root-top" | "root-bottom";
export type MoveValidationReason = "self" | "cycle" | "depth" | "noop" | "boundary";

export interface MoveProposal {
  kind: MoveKind;
  parentId: string | null;
  insertionIndex: number;
  siblings: Page[];
  position: number;
  previewLabel: string;
}

export interface MoveResolution {
  ok: true;
  proposal: MoveProposal;
}

export interface MoveRejection {
  ok: false;
  reason: MoveValidationReason;
  message: string;
}

export type MoveResult = MoveResolution | MoveRejection;

export interface PageTreeIndex {
  byId: Map<string, Page>;
  // Children sorted by position, archived pages excluded. Use null key for roots.
  childrenByParent: Map<string | null, Page[]>;
}

function getPageLabel(page: Page): string {
  return page.title || DEFAULT_PAGE_TITLE;
}

export function buildPageMap(allPages: Page[]): Map<string, Page> {
  return new Map(allPages.map((page) => [page.id, page]));
}

export function buildPageTreeIndex(allPages: Page[]): PageTreeIndex {
  const byId = new Map<string, Page>();
  const childrenByParent = new Map<string | null, Page[]>();
  for (const page of allPages) {
    byId.set(page.id, page);
    if (page.archived_at) continue;
    const arr = childrenByParent.get(page.parent_id);
    if (arr) arr.push(page);
    else childrenByParent.set(page.parent_id, [page]);
  }
  for (const arr of childrenByParent.values()) arr.sort((a, b) => a.position - b.position);
  return { byId, childrenByParent };
}

export function getPageDepth(byId: Map<string, Page>, pageId: string): number {
  let cur = byId.get(pageId);
  let depth = 0;
  while (cur?.parent_id) {
    cur = byId.get(cur.parent_id);
    depth += 1;
  }
  return depth;
}

function getSubtreeDepth(index: PageTreeIndex, pageId: string): number {
  const children = index.childrenByParent.get(pageId);
  if (!children || children.length === 0) return 0;
  let max = 0;
  for (const child of children) {
    const d = getSubtreeDepth(index, child.id);
    if (d > max) max = d;
  }
  return 1 + max;
}

function isDescendant(byId: Map<string, Page>, draggedId: string, targetId: string): boolean {
  let cur = byId.get(targetId);
  while (cur) {
    if (cur.parent_id === draggedId) return true;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return false;
}

function siblingsFromIndex(index: PageTreeIndex, parentId: string | null, excludeId?: string): Page[] {
  const arr = index.childrenByParent.get(parentId);
  if (!arr) return [];
  return excludeId ? arr.filter((p) => p.id !== excludeId) : arr.slice();
}

export function getSortedSiblings(allPages: Page[], parentId: string | null, excludeId?: string): Page[] {
  return allPages
    .filter((page) => page.parent_id === parentId && page.id !== excludeId && !page.archived_at)
    .sort((a, b) => a.position - b.position);
}

export function computePosition(siblings: Page[], index: number): number {
  if (siblings.length === 0) return 1;
  if (index <= 0) return siblings[0].position - 1;
  if (index >= siblings.length) return siblings[siblings.length - 1].position + 1;
  return (siblings[index - 1].position + siblings[index].position) / 2;
}

export function getPagePathLabel(byId: Map<string, Page>, pageId: string): string {
  const parts: string[] = [];
  let cur = byId.get(pageId);
  while (cur) {
    parts.unshift(cur.title);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" / ");
}

export function getAncestorIds(byId: Map<string, Page>, pageId: string | null): Set<string> {
  const result = new Set<string>();
  let cur = pageId ? byId.get(pageId) : undefined;
  while (cur?.parent_id) {
    result.add(cur.parent_id);
    cur = byId.get(cur.parent_id);
  }
  return result;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function validateMoveParent(index: PageTreeIndex, page: Page, targetParentId: string | null): MoveRejection | null {
  if (targetParentId === page.id) {
    return { ok: false, reason: "self", message: "A page cannot move inside itself" };
  }

  if (targetParentId !== null && isDescendant(index.byId, page.id, targetParentId)) {
    return { ok: false, reason: "cycle", message: "That move would place the page inside its own subtree" };
  }

  const newDepth = targetParentId ? getPageDepth(index.byId, targetParentId) + 1 : 0;
  const subtreeDepth = getSubtreeDepth(index, page.id);
  if (newDepth + subtreeDepth >= MAX_TREE_DEPTH) {
    return {
      ok: false,
      reason: "depth",
      message: `That move would exceed the maximum nesting depth of ${MAX_TREE_DEPTH}`,
    };
  }

  return null;
}

function finalizeMoveProposal(args: {
  index: PageTreeIndex;
  page: Page;
  parentId: string | null;
  insertionIndex: number;
  siblings: Page[];
  kind: MoveKind;
  previewLabel: string;
}): MoveResult {
  const { index, page, parentId, insertionIndex, siblings, kind, previewLabel } = args;

  const validation = validateMoveParent(index, page, parentId);
  if (validation) return validation;

  if (page.parent_id === parentId) {
    const currentOrder = siblingsFromIndex(index, parentId).map((candidate) => candidate.id);
    const nextOrder = [...siblings.slice(0, insertionIndex), page, ...siblings.slice(insertionIndex)].map(
      (candidate) => candidate.id,
    );
    if (arraysEqual(currentOrder, nextOrder)) {
      return { ok: false, reason: "noop", message: "That move would not change anything" };
    }
  }

  return {
    ok: true,
    proposal: {
      kind,
      parentId,
      insertionIndex,
      siblings,
      position: computePosition(siblings, insertionIndex),
      previewLabel,
    },
  };
}

function resolveIndex(allPages: Page[], index?: PageTreeIndex): PageTreeIndex {
  return index ?? buildPageTreeIndex(allPages);
}

export function resolveMoveUp(allPages: Page[], page: Page, providedIndex?: PageTreeIndex): MoveResult {
  const index = resolveIndex(allPages, providedIndex);
  const currentSiblings = siblingsFromIndex(index, page.parent_id);
  const currentIndex = currentSiblings.findIndex((candidate) => candidate.id === page.id);
  if (currentIndex <= 0) {
    return { ok: false, reason: "boundary", message: "Already first in this level" };
  }

  const siblings = siblingsFromIndex(index, page.parent_id, page.id);
  const target = currentSiblings[currentIndex - 1];
  return finalizeMoveProposal({
    index,
    page,
    parentId: page.parent_id,
    insertionIndex: currentIndex - 1,
    siblings,
    kind: "reorder",
    previewLabel: `Move before ${getPageLabel(target)}`,
  });
}

export function resolveMoveDown(allPages: Page[], page: Page, providedIndex?: PageTreeIndex): MoveResult {
  const index = resolveIndex(allPages, providedIndex);
  const currentSiblings = siblingsFromIndex(index, page.parent_id);
  const currentIndex = currentSiblings.findIndex((candidate) => candidate.id === page.id);
  if (currentIndex === -1 || currentIndex >= currentSiblings.length - 1) {
    return { ok: false, reason: "boundary", message: "Already last in this level" };
  }

  const siblings = siblingsFromIndex(index, page.parent_id, page.id);
  const target = currentSiblings[currentIndex + 1];
  return finalizeMoveProposal({
    index,
    page,
    parentId: page.parent_id,
    insertionIndex: currentIndex + 1,
    siblings,
    kind: "reorder",
    previewLabel: `Move after ${getPageLabel(target)}`,
  });
}

export function resolveIndent(allPages: Page[], page: Page, providedIndex?: PageTreeIndex): MoveResult {
  const index = resolveIndex(allPages, providedIndex);
  const currentSiblings = siblingsFromIndex(index, page.parent_id);
  const currentIndex = currentSiblings.findIndex((candidate) => candidate.id === page.id);
  if (currentIndex <= 0) {
    return { ok: false, reason: "boundary", message: "No previous sibling to indent into" };
  }

  const previousSibling = currentSiblings[currentIndex - 1];
  const siblings = siblingsFromIndex(index, previousSibling.id, page.id);
  return finalizeMoveProposal({
    index,
    page,
    parentId: previousSibling.id,
    insertionIndex: siblings.length,
    siblings,
    kind: "indent",
    previewLabel: `Move inside ${getPageLabel(previousSibling)}`,
  });
}

export function resolveOutdent(allPages: Page[], page: Page, providedIndex?: PageTreeIndex): MoveResult {
  const index = resolveIndex(allPages, providedIndex);
  if (!page.parent_id) {
    return { ok: false, reason: "boundary", message: "Already at the top level" };
  }

  const parent = index.byId.get(page.parent_id);
  if (!parent) {
    return { ok: false, reason: "boundary", message: "Parent page not found" };
  }

  const siblings = siblingsFromIndex(index, parent.parent_id, page.id);
  const parentIndex = siblings.findIndex((candidate) => candidate.id === parent.id);
  if (parentIndex === -1) {
    return { ok: false, reason: "boundary", message: "Parent page not found in the destination level" };
  }

  return finalizeMoveProposal({
    index,
    page,
    parentId: parent.parent_id,
    insertionIndex: parentIndex + 1,
    siblings,
    kind: parent.parent_id === null ? "to_root" : "outdent",
    previewLabel: `Move after ${getPageLabel(parent)}`,
  });
}

export function resolveMoveRelative(args: {
  allPages: Page[];
  page: Page;
  targetPage: Page;
  relation: "before" | "inside" | "after";
  index?: PageTreeIndex;
}): MoveResult {
  const { allPages, page, targetPage, relation } = args;
  const index = resolveIndex(allPages, args.index);

  if (relation === "inside") {
    const siblings = siblingsFromIndex(index, targetPage.id, page.id);
    return finalizeMoveProposal({
      index,
      page,
      parentId: targetPage.id,
      insertionIndex: siblings.length,
      siblings,
      kind: "into_parent",
      previewLabel: `Move inside ${getPageLabel(targetPage)}`,
    });
  }

  const siblings = siblingsFromIndex(index, targetPage.parent_id, page.id);
  const targetIndex = siblings.findIndex((candidate) => candidate.id === targetPage.id);
  if (targetIndex === -1) {
    return { ok: false, reason: "boundary", message: "Target page is not in the expected level" };
  }

  const insertionIndex = relation === "before" ? targetIndex : targetIndex + 1;
  return finalizeMoveProposal({
    index,
    page,
    parentId: targetPage.parent_id,
    insertionIndex,
    siblings,
    kind:
      targetPage.parent_id === page.parent_id ? "reorder" : targetPage.parent_id === null ? "to_root" : "into_parent",
    previewLabel:
      relation === "before" ? `Move before ${getPageLabel(targetPage)}` : `Move after ${getPageLabel(targetPage)}`,
  });
}

export function resolveMoveToRoot(
  allPages: Page[],
  page: Page,
  placement: "top" | "bottom",
  providedIndex?: PageTreeIndex,
): MoveResult {
  const index = resolveIndex(allPages, providedIndex);
  const siblings = siblingsFromIndex(index, null, page.id);
  return finalizeMoveProposal({
    index,
    page,
    parentId: null,
    insertionIndex: placement === "top" ? 0 : siblings.length,
    siblings,
    kind: "to_root",
    previewLabel: placement === "top" ? "Move to the top level" : "Move to the bottom of the top level",
  });
}
