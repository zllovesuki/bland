import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";

type MoveDirection = -1 | 1;

interface TopLevelBlockInfo {
  index: number;
  pos: number;
  node: PMNode;
}

function getTopLevelBlocks(doc: PMNode): TopLevelBlockInfo[] {
  const blocks: TopLevelBlockInfo[] = [];
  doc.forEach((node, pos, index) => {
    blocks.push({ index, pos, node });
  });
  return blocks;
}

function getTopLevelBlock(blocks: TopLevelBlockInfo[], pos: number): TopLevelBlockInfo | null {
  return blocks.find((block) => block.pos === pos) ?? null;
}

export function canMoveTopLevelBlock(doc: PMNode, pos: number, direction: MoveDirection): boolean {
  const blocks = getTopLevelBlocks(doc);
  const block = getTopLevelBlock(blocks, pos);
  if (!block) return false;

  const targetIndex = block.index + direction;
  return targetIndex >= 0 && targetIndex < blocks.length;
}

export function applyMoveTopLevelBlock(tr: Transaction, pos: number, direction: MoveDirection): boolean {
  const blocks = getTopLevelBlocks(tr.doc);
  const source = getTopLevelBlock(blocks, pos);
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

export function applyDeleteTopLevelBlock(tr: Transaction, pos: number): boolean {
  const blocks = getTopLevelBlocks(tr.doc);
  const block = getTopLevelBlock(blocks, pos);
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

export function moveTopLevelBlock(editor: Editor, pos: number, direction: MoveDirection): boolean {
  const tr = editor.state.tr;
  if (!applyMoveTopLevelBlock(tr, pos, direction)) return false;
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

export function deleteTopLevelBlock(editor: Editor, pos: number): boolean {
  const tr = editor.state.tr;
  if (!applyDeleteTopLevelBlock(tr, pos)) return false;
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}
