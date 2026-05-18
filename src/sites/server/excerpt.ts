import type { JSONContent } from "@tiptap/core";

const DESCRIPTION_MIN_BREAK = 150;
const DESCRIPTION_MAX_LENGTH = 160;
const DESCRIPTION_ELLIPSIS = "...";

export function extractSiteDescription(content: JSONContent): string | null {
  const text = collapseWhitespace(collectText(content).join(" "));
  if (!text) return null;
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text;

  const window = text.slice(0, DESCRIPTION_MAX_LENGTH);
  const breakAt = window.search(/\s+\S*$/);
  if (breakAt >= DESCRIPTION_MIN_BREAK) {
    return `${window.slice(0, breakAt).trimEnd()}${DESCRIPTION_ELLIPSIS}`;
  }
  return `${text.slice(0, DESCRIPTION_MAX_LENGTH - DESCRIPTION_ELLIPSIS.length).trimEnd()}${DESCRIPTION_ELLIPSIS}`;
}

function collectText(node: JSONContent): string[] {
  if (!node || typeof node !== "object") return [];
  const chunks: string[] = [];
  if (typeof node.text === "string") chunks.push(node.text);
  if (node.type === "hardBreak") chunks.push(" ");
  if (Array.isArray(node.content)) {
    for (const child of node.content) chunks.push(...collectText(child));
  }
  return chunks;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
