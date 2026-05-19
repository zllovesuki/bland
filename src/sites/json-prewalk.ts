import type { JSONContent } from "@tiptap/core";

const UPLOAD_PATH = /^\/uploads\/([A-Za-z0-9_-]+)$/;

export interface PreWalkMention {
  reachable: boolean;
}

export interface PreWalkOptions {
  // The page that owns the rendered document. Image sources are rewritten to
  // `/_assets/<pageId>/<uploadId>` so the asset gate can verify the
  // (page, upload) pair on every visitor request.
  pageId: string;
  mentions: ReadonlyMap<string, PreWalkMention>;
}

/**
 * Pre-walks the Tiptap JSON before the static renderer runs:
 * - rewrites `image.attrs.src` of the form `/uploads/<id>` to
 *   `/_assets/<pageId>/<id>` so visitors hit the asset gate (NOT the
 *   authenticated `/uploads/:id` route),
 * - redacts `pageMention.attrs.pageId` for any mention whose target is not
 *   reachable in the current site's published set. The static renderer maps
 *   `pageId=null` to the restricted presentation, so `data-page-id` never
 *   leaks for redacted mentions.
 *
 * Mutates `content` in place and returns it for convenience.
 */
export function preWalkSitesJson(content: JSONContent, options: PreWalkOptions): JSONContent {
  walk(content, options);
  return content;
}

function walk(node: JSONContent, options: PreWalkOptions): void {
  if (!node || typeof node !== "object") return;

  if (node.type === "pageMention") {
    const pageId = readString(node.attrs?.pageId);
    if (pageId) {
      const resolved = options.mentions.get(pageId);
      if (!resolved || !resolved.reachable) {
        if (node.attrs) {
          node.attrs.pageId = null;
        }
      }
    }
  } else if (node.type === "image") {
    const src = readString(node.attrs?.src);
    if (src) {
      const match = UPLOAD_PATH.exec(src);
      if (match) {
        node.attrs!.src = `/_assets/${options.pageId}/${match[1]}`;
      }
    }
  }

  const children = node.content;
  if (Array.isArray(children)) {
    for (const child of children) {
      walk(child, options);
    }
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Collect every `pageMention.attrs.pageId` referenced anywhere in the
 * document. Used to batch-resolve mentions against the publish set before
 * the render walk runs.
 */
export function collectMentionPageIds(content: JSONContent): string[] {
  const ids = new Set<string>();
  collect(content, ids);
  return [...ids];
}

function collect(node: JSONContent, into: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (node.type === "pageMention") {
    const pageId = readString(node.attrs?.pageId);
    if (pageId) into.add(pageId);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collect(child, into);
    }
  }
}
