import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { scheduleMovedTextblockSelectionFinalization } from "./moved-textblock-selection";
import { findTopLevelBlockByBid, getTopLevelBlocks } from "./top-level-blocks";

type MoveDirection = -1 | 1;

export function canMoveTopLevelBlock(doc: Transaction["doc"], bid: string | null, direction: MoveDirection): boolean {
  const blocks = getTopLevelBlocks(doc);
  const block = blocks.find((candidate) => candidate.bid === bid) ?? null;
  if (!block) return false;

  const targetIndex = block.index + direction;
  return targetIndex >= 0 && targetIndex < blocks.length;
}

export function applyMoveTopLevelBlock(tr: Transaction, bid: string | null, direction: MoveDirection): boolean {
  const blocks = getTopLevelBlocks(tr.doc);
  const source = blocks.find((candidate) => candidate.bid === bid) ?? null;
  if (!source) return false;

  const targetIndex = source.index + direction;
  if (targetIndex < 0 || targetIndex >= blocks.length) return false;

  const target = blocks[targetIndex];
  if (!target) return false;

  const sourceStart = source.pos;
  const sourceEnd = sourceStart + source.node.nodeSize;
  const insertAnchor = direction < 0 ? target.pos : target.pos + target.node.nodeSize;

  tr.delete(sourceStart, sourceEnd);
  const insertPos = tr.mapping.map(insertAnchor, direction < 0 ? -1 : 1);
  tr.insert(insertPos, source.node);
  tr.setSelection(NodeSelection.create(tr.doc, insertPos));
  return true;
}

export function applyDeleteTopLevelBlock(tr: Transaction, bid: string | null): boolean {
  const blocks = getTopLevelBlocks(tr.doc);
  const block = blocks.find((candidate) => candidate.bid === bid) ?? null;
  if (!block) return false;

  if (blocks.length === 1) {
    const paragraph = tr.doc.type.schema.nodes.paragraph;
    if (!paragraph) return false;

    tr.replaceWith(block.pos, block.pos + block.node.nodeSize, paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, 1));
    return true;
  }

  tr.delete(block.pos, block.pos + block.node.nodeSize);
  const nextPos = Math.min(block.pos, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos)));
  return true;
}

export function moveTopLevelBlock(editor: Editor, bid: string | null, direction: MoveDirection): boolean {
  const tr = editor.state.tr;
  if (!applyMoveTopLevelBlock(tr, bid, direction)) return false;
  editor.view.dispatch(tr);
  editor.view.focus();
  scheduleMovedTextblockSelectionFinalization(editor.view);
  return true;
}

export function deleteTopLevelBlock(editor: Editor, bid: string | null): boolean {
  const tr = editor.state.tr;
  if (!applyDeleteTopLevelBlock(tr, bid)) return false;
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

export function getCurrentTopLevelBlock(editor: Editor, bid: string | null) {
  return findTopLevelBlockByBid(editor.state.doc, bid);
}
