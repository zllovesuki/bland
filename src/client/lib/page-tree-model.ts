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

function getPageLabel(page: Page): string {
  return page.title || DEFAULT_PAGE_TITLE;
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

export function getSubtreeDepth(allPages: Page[], pageId: string): number {
  const children = allPages.filter((page) => page.parent_id === pageId && !page.archived_at);
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((child) => getSubtreeDepth(allPages, child.id)));
}

export function isDescendant(allPages: Page[], draggedId: string, targetId: string): boolean {
  const byId = new Map(allPages.map((page) => [page.id, page]));
  let cur = byId.get(targetId);
  while (cur) {
    if (cur.parent_id === draggedId) return true;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return false;
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

export function buildPageMap(allPages: Page[]): Map<string, Page> {
  return new Map(allPages.map((page) => [page.id, page]));
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

function validateMoveParent(allPages: Page[], page: Page, targetParentId: string | null): MoveRejection | null {
  if (targetParentId === page.id) {
    return { ok: false, reason: "self", message: "A page cannot move inside itself" };
  }

  if (targetParentId !== null && isDescendant(allPages, page.id, targetParentId)) {
    return { ok: false, reason: "cycle", message: "That move would place the page inside its own subtree" };
  }

  const byId = buildPageMap(allPages);
  const newDepth = targetParentId ? getPageDepth(byId, targetParentId) + 1 : 0;
  const subtreeDepth = getSubtreeDepth(allPages, page.id);
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
  allPages: Page[];
  page: Page;
  parentId: string | null;
  insertionIndex: number;
  siblings: Page[];
  kind: MoveKind;
  previewLabel: string;
}): MoveResult {
  const { allPages, page, parentId, insertionIndex, siblings, kind, previewLabel } = args;

  const validation = validateMoveParent(allPages, page, parentId);
  if (validation) return validation;

  if (page.parent_id === parentId) {
    const currentOrder = getSortedSiblings(allPages, parentId).map((candidate) => candidate.id);
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

export function resolveMoveUp(allPages: Page[], page: Page): MoveResult {
  const currentSiblings = getSortedSiblings(allPages, page.parent_id);
  const currentIndex = currentSiblings.findIndex((candidate) => candidate.id === page.id);
  if (currentIndex <= 0) {
    return { ok: false, reason: "boundary", message: "Already first in this level" };
  }

  const siblings = getSortedSiblings(allPages, page.parent_id, page.id);
  const target = currentSiblings[currentIndex - 1];
  return finalizeMoveProposal({
    allPages,
    page,
    parentId: page.parent_id,
    insertionIndex: currentIndex - 1,
    siblings,
    kind: "reorder",
    previewLabel: `Move before ${getPageLabel(target)}`,
  });
}

export function resolveMoveDown(allPages: Page[], page: Page): MoveResult {
  const currentSiblings = getSortedSiblings(allPages, page.parent_id);
  const currentIndex = currentSiblings.findIndex((candidate) => candidate.id === page.id);
  if (currentIndex === -1 || currentIndex >= currentSiblings.length - 1) {
    return { ok: false, reason: "boundary", message: "Already last in this level" };
  }

  const siblings = getSortedSiblings(allPages, page.parent_id, page.id);
  const target = currentSiblings[currentIndex + 1];
  return finalizeMoveProposal({
    allPages,
    page,
    parentId: page.parent_id,
    insertionIndex: currentIndex + 1,
    siblings,
    kind: "reorder",
    previewLabel: `Move after ${getPageLabel(target)}`,
  });
}

export function resolveIndent(allPages: Page[], page: Page): MoveResult {
  const currentSiblings = getSortedSiblings(allPages, page.parent_id);
  const currentIndex = currentSiblings.findIndex((candidate) => candidate.id === page.id);
  if (currentIndex <= 0) {
    return { ok: false, reason: "boundary", message: "No previous sibling to indent into" };
  }

  const previousSibling = currentSiblings[currentIndex - 1];
  const siblings = getSortedSiblings(allPages, previousSibling.id, page.id);
  return finalizeMoveProposal({
    allPages,
    page,
    parentId: previousSibling.id,
    insertionIndex: siblings.length,
    siblings,
    kind: "indent",
    previewLabel: `Move inside ${getPageLabel(previousSibling)}`,
  });
}

export function resolveOutdent(allPages: Page[], page: Page): MoveResult {
  if (!page.parent_id) {
    return { ok: false, reason: "boundary", message: "Already at the top level" };
  }

  const byId = buildPageMap(allPages);
  const parent = byId.get(page.parent_id);
  if (!parent) {
    return { ok: false, reason: "boundary", message: "Parent page not found" };
  }

  const siblings = getSortedSiblings(allPages, parent.parent_id, page.id);
  const parentIndex = siblings.findIndex((candidate) => candidate.id === parent.id);
  if (parentIndex === -1) {
    return { ok: false, reason: "boundary", message: "Parent page not found in the destination level" };
  }

  return finalizeMoveProposal({
    allPages,
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
}): MoveResult {
  const { allPages, page, targetPage, relation } = args;

  if (relation === "inside") {
    const siblings = getSortedSiblings(allPages, targetPage.id, page.id);
    return finalizeMoveProposal({
      allPages,
      page,
      parentId: targetPage.id,
      insertionIndex: siblings.length,
      siblings,
      kind: "into_parent",
      previewLabel: `Move inside ${getPageLabel(targetPage)}`,
    });
  }

  const siblings = getSortedSiblings(allPages, targetPage.parent_id, page.id);
  const targetIndex = siblings.findIndex((candidate) => candidate.id === targetPage.id);
  if (targetIndex === -1) {
    return { ok: false, reason: "boundary", message: "Target page is not in the expected level" };
  }

  const insertionIndex = relation === "before" ? targetIndex : targetIndex + 1;
  return finalizeMoveProposal({
    allPages,
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

export function resolveMoveToRoot(allPages: Page[], page: Page, placement: "top" | "bottom"): MoveResult {
  const siblings = getSortedSiblings(allPages, null, page.id);
  return finalizeMoveProposal({
    allPages,
    page,
    parentId: null,
    insertionIndex: placement === "top" ? 0 : siblings.length,
    siblings,
    kind: "to_root",
    previewLabel: placement === "top" ? "Move to the top level" : "Move to the bottom of the top level",
  });
}
