import type { JSONContent } from "@tiptap/core";
import {
  createUniqueOutlineAnchorId,
  normalizeOutlineText,
  readOutlineLevel,
  type OutlineItem,
} from "@/shared/editor/components/outline-model";

export interface SitesOutline {
  items: OutlineItem[];
  headingAnchorIds: (string | null)[];
}

export function collectSitesOutline(content: JSONContent): SitesOutline {
  const used = new Set<string>();
  const items: OutlineItem[] = [];
  const headingAnchorIds: (string | null)[] = [];

  walk(content, (node, includeInOutline) => {
    if (!includeInOutline) {
      headingAnchorIds.push(null);
      return;
    }

    const text = readNodeText(node);
    if (!text) {
      headingAnchorIds.push(null);
      return;
    }

    const id = createUniqueOutlineAnchorId(text, used);
    headingAnchorIds.push(id);
    items.push({
      id,
      text,
      level: readOutlineLevel(node.attrs?.level),
      href: `#${id}`,
    });
  });

  return { items, headingAnchorIds };
}

function walk(node: JSONContent, onHeading: (node: JSONContent, includeInOutline: boolean) => void): void {
  walkNode(node, onHeading, false);
}

function walkNode(
  node: JSONContent,
  onHeading: (node: JSONContent, includeInOutline: boolean) => void,
  insideClosedDetails: boolean,
): void {
  if (!node || typeof node !== "object") return;
  if (node.type === "heading") {
    onHeading(node, !insideClosedDetails);
    return;
  }

  const nextInsideClosedDetails = insideClosedDetails || (node.type === "details" && !isDetailsOpen(node));
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      walkNode(child, onHeading, nextInsideClosedDetails);
    }
  }
}

function isDetailsOpen(node: JSONContent): boolean {
  return node.attrs?.open === true || node.attrs?.open === "true";
}

function readNodeText(node: JSONContent): string {
  const parts: string[] = [];
  collectText(node, parts);
  return normalizeOutlineText(parts.join(" "));
}

function collectText(node: JSONContent, parts: string[]): void {
  if (typeof node.text === "string") {
    parts.push(node.text);
  }
  if (!Array.isArray(node.content)) return;
  for (const child of node.content) {
    collectText(child, parts);
  }
}
