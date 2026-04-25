import type { EditorState } from "@tiptap/pm/state";
import type { Node as PmNode, ResolvedPos } from "@tiptap/pm/model";

const BLOCK_TEXT_CAP = 2000;
const SELECTION_CAP = 4000;
const MAX_EMPTY_SIBLING_WALK = 12;

export interface RewriteContext {
  selectedText: string;
  parentBlock: string;
  beforeBlock: string;
  afterBlock: string;
}

export interface GenerateContext {
  beforeBlock: string;
  afterBlock: string;
}

export function extractRewriteContext(state: EditorState): RewriteContext {
  const { from, to } = state.selection;
  const selectedText = capText(state.doc.textBetween(from, to, "\n", " "), SELECTION_CAP);

  const boundary = topLevelBoundaryAt(state.doc, state.doc.resolve(from));
  const parentNode = boundary ? state.doc.child(boundary.index) : null;
  const parentBlock = parentNode ? capText(parentNode.textContent, BLOCK_TEXT_CAP) : "";

  return {
    selectedText,
    parentBlock,
    beforeBlock: boundary ? nearestNonEmptySibling(state.doc, boundary.index - 1, -1) : "",
    afterBlock: boundary ? nearestNonEmptySibling(state.doc, boundary.index + 1, 1) : "",
  };
}

export function extractDocumentTitle(doc: PmNode): string {
  let title = "";
  doc.descendants((node) => {
    if (title) return false;
    if (node.type.name === "heading" && (node.attrs as { level?: number }).level === 1) {
      const text = node.textContent.trim();
      if (text) {
        title = text;
        return false;
      }
    }
    return true;
  });
  return title;
}

export function extractGenerateContext(state: EditorState, cursorPos: number): GenerateContext {
  const clamped = Math.max(0, Math.min(cursorPos, state.doc.content.size));
  const $pos = state.doc.resolve(clamped);
  const boundary = topLevelBoundaryAt(state.doc, $pos);
  if (!boundary) {
    return { beforeBlock: "", afterBlock: "" };
  }

  const current = state.doc.child(boundary.index);
  const currentText = current.textContent;

  const prevText = nearestNonEmptySibling(state.doc, boundary.index - 1, -1);
  const nextText = nearestNonEmptySibling(state.doc, boundary.index + 1, 1);

  if (currentText.length === 0) {
    return {
      beforeBlock: prevText,
      afterBlock: nextText,
    };
  }

  // Slice the current block at the cursor. textBetween over the top-level
  // block range works uniformly for paragraphs, headings, list items,
  // callouts, and details blocks (depth >= 2). When the cursor is at a
  // top-level boundary ($pos.depth === 0), there is no inside-block position
  // to slice at, so treat the cursor as sitting at the start of the block.
  let beforeCursor = "";
  let afterCursor = currentText;
  if ($pos.depth > 0) {
    const blockStart = $pos.before(1) + 1;
    const blockEnd = $pos.after(1) - 1;
    if (clamped >= blockStart && clamped <= blockEnd) {
      beforeCursor = state.doc.textBetween(blockStart, clamped, "\n", " ");
      afterCursor = state.doc.textBetween(clamped, blockEnd, "\n", " ");
    }
  }

  const before = prevText && beforeCursor ? `${prevText}\n\n${beforeCursor}` : prevText || beforeCursor;
  const after = afterCursor && nextText ? `${afterCursor}\n\n${nextText}` : afterCursor || nextText;
  return {
    beforeBlock: capText(before, BLOCK_TEXT_CAP),
    afterBlock: capText(after, BLOCK_TEXT_CAP),
  };
}

function topLevelBoundaryAt(doc: PmNode, pos: ResolvedPos): { index: number } | null {
  if (doc.childCount === 0) return null;
  if (pos.depth === 0) {
    const index = Math.min(pos.index(0), doc.childCount - 1);
    return { index };
  }
  return { index: pos.index(0) };
}

function nearestNonEmptySibling(doc: PmNode, startIndex: number, step: 1 | -1): string {
  let index = startIndex;
  let walked = 0;
  while (walked < MAX_EMPTY_SIBLING_WALK) {
    if (index < 0 || index >= doc.childCount) return "";
    const text = doc.child(index).textContent;
    if (text.length > 0) return capText(text, BLOCK_TEXT_CAP);
    index += step;
    walked += 1;
  }
  return "";
}

function capText(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return text.slice(0, cap);
}
