import type { Node as PMNode } from "@tiptap/pm/model";
import { nanoid } from "nanoid";

export interface TopLevelBlockInfo {
  bid: string | null;
  index: number;
  pos: number;
  node: PMNode;
}

// Only these nodes participate in the current top-level drag-and-drop UX.
// Nested blocks remain out of scope for this pass.
export const TOP_LEVEL_MOVABLE_NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "details",
  "callout",
  "image",
  "table",
] as const;

const TOP_LEVEL_MOVABLE_NODE_TYPE_SET = new Set<string>(TOP_LEVEL_MOVABLE_NODE_TYPES);

export function generateBlockBid(): string {
  return nanoid(6);
}

function isTopLevelMovableNode(node: PMNode): boolean {
  return TOP_LEVEL_MOVABLE_NODE_TYPE_SET.has(node.type.name);
}

export function getTopLevelBlocks(doc: PMNode): TopLevelBlockInfo[] {
  const blocks: TopLevelBlockInfo[] = [];
  doc.forEach((node, pos, index) => {
    if (!isTopLevelMovableNode(node)) return;
    blocks.push({
      bid: typeof node.attrs.bid === "string" && node.attrs.bid.length > 0 ? node.attrs.bid : null,
      index,
      pos,
      node,
    });
  });
  return blocks;
}

export function getTopLevelStructureSignature(doc: PMNode): string {
  return getTopLevelBlocks(doc)
    .map((block) => `${block.node.type.name}:${block.bid ?? `missing@${block.index}`}`)
    .join("|");
}

export function findTopLevelBlockByBid(doc: PMNode, bid: string | null | undefined): TopLevelBlockInfo | null {
  if (!bid) return null;
  return getTopLevelBlocks(doc).find((block) => block.bid === bid) ?? null;
}
