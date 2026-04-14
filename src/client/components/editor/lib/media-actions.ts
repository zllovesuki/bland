import type { Editor, JSONContent, Range } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { uploadFile } from "@/client/lib/uploads";
import { toast } from "@/client/components/toast";

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];
export const IMAGE_TARGET_MISSING_MESSAGE = "That image block no longer exists.";

export interface UploadContext {
  workspaceId: string | undefined;
  pageId: string;
  shareToken: string | undefined;
}

export interface ImageNodeTarget {
  pos: number;
  dom: HTMLElement | null;
}

export interface InsertedImagePlaceholder {
  target: ImageNodeTarget;
  nextPos: number;
}

function findInsertedImagePos(doc: Editor["state"]["doc"], pendingInsertId: string | null): number | null {
  let foundPos: number | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name !== "image") return true;
    if (pendingInsertId !== null && node.attrs.pendingInsertId !== pendingInsertId) return true;
    if (pendingInsertId === null && node.attrs.src !== "") return true;
    foundPos = pos;
    return false;
  });

  return foundPos;
}

export function resolveShareUrl(src: string, shareToken?: string): string {
  if (shareToken && src.startsWith("/uploads/")) {
    return `${src}?share=${shareToken}`;
  }
  return src;
}

export function createImageNodeTarget(editor: Editor, pos: number): ImageNodeTarget {
  try {
    const dom = editor.view.nodeDOM(pos);
    return { pos, dom: dom instanceof HTMLElement ? dom : null };
  } catch {
    return { pos, dom: null };
  }
}

export function resolveImageTargetPos(editor: Editor, target: ImageNodeTarget): number | null {
  if (target.dom?.isConnected) {
    try {
      const pos = editor.view.posAtDOM(target.dom, 0);
      if (editor.state.doc.nodeAt(pos)?.type.name === "image") {
        return pos;
      }
    } catch {
      // Fall through to the last known document position.
    }
  }

  try {
    return editor.state.doc.nodeAt(target.pos)?.type.name === "image" ? target.pos : null;
  } catch {
    return null;
  }
}

export function getImageTargetDom(editor: Editor, target: ImageNodeTarget): HTMLElement | null {
  const pos = resolveImageTargetPos(editor, target);
  if (pos !== null) {
    try {
      const dom = editor.view.nodeDOM(pos);
      if (dom instanceof HTMLElement) return dom;
    } catch {
      // Fall through to any still-connected captured DOM node.
    }
  }

  return target.dom?.isConnected ? target.dom : null;
}

export function updateImageAttributesAtTarget(
  editor: Editor,
  target: ImageNodeTarget,
  attrs: Record<string, unknown>,
): boolean {
  const pos = resolveImageTargetPos(editor, target);
  if (pos === null) return false;

  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== "image") return false;

  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  editor.view.dispatch(tr);
  return true;
}

export function replaceImageSourceAtTarget(editor: Editor, target: ImageNodeTarget, src: string): boolean {
  const pos = resolveImageTargetPos(editor, target);
  if (pos === null) return false;

  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== "image") return false;

  const nextAttrs: Record<string, unknown> = { ...node.attrs, src };
  if ("pendingInsertId" in node.attrs) {
    nextAttrs.pendingInsertId = null;
  }

  const tr = editor.state.tr.setNodeMarkup(pos, undefined, nextAttrs);
  editor.view.dispatch(tr);
  return true;
}

export function deleteImageAtTarget(editor: Editor, target: ImageNodeTarget): boolean {
  const pos = resolveImageTargetPos(editor, target);
  if (pos === null) return false;

  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;

  const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
  editor.view.dispatch(tr);
  return true;
}

function createPendingImageContent(editor: Editor): { content: JSONContent; pendingInsertId: string | null } | null {
  if (!editor.isEditable) return null;

  const imageType = editor.state.schema.nodes.image;
  if (!imageType) return null;

  const supportsPendingInsertId = "pendingInsertId" in (imageType.spec.attrs ?? {});
  const pendingInsertId = supportsPendingInsertId ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null;
  const content: JSONContent = {
    type: "image",
    attrs: pendingInsertId === null ? { src: "" } : { src: "", pendingInsertId },
  };

  return { content, pendingInsertId };
}

function finalizeInsertedImagePlaceholder(
  editor: Editor,
  pendingInsertId: string | null,
): InsertedImagePlaceholder | null {
  const insertedPos = findInsertedImagePos(editor.state.doc, pendingInsertId);
  if (insertedPos === null) return null;

  const node = editor.state.doc.nodeAt(insertedPos);
  if (!node || node.type.name !== "image") return null;

  const tr = editor.state.tr;
  if (pendingInsertId !== null) {
    tr.setNodeMarkup(insertedPos, undefined, { ...node.attrs, pendingInsertId: null });
  }

  const resolvedNode = tr.doc.nodeAt(insertedPos);
  if (!resolvedNode || resolvedNode.type.name !== "image") return null;

  tr.setSelection(NodeSelection.create(tr.doc, insertedPos));
  editor.view.dispatch(tr);
  editor.commands.focus(null, { scrollIntoView: false });

  return {
    target: createImageNodeTarget(editor, insertedPos),
    nextPos: insertedPos + resolvedNode.nodeSize,
  };
}

export function insertImagePlaceholderAtRange(editor: Editor, range: Range): InsertedImagePlaceholder | null {
  const pending = createPendingImageContent(editor);
  if (!pending) return null;

  editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).insertContent(pending.content).run();
  return finalizeInsertedImagePlaceholder(editor, pending.pendingInsertId);
}

export function insertImagePlaceholderAtPos(editor: Editor, pos: number): InsertedImagePlaceholder | null {
  const pending = createPendingImageContent(editor);
  if (!pending) return null;

  editor.chain().focus(null, { scrollIntoView: false }).insertContentAt(pos, pending.content).run();
  return finalizeInsertedImagePlaceholder(editor, pending.pendingInsertId);
}

export async function uploadAndReplaceImageAtTarget(
  editor: Editor,
  ctx: UploadContext,
  file: File,
  target: ImageNodeTarget,
): Promise<boolean> {
  if (!ctx.workspaceId) return false;
  try {
    const src = await uploadFile(ctx.workspaceId, file, ctx.pageId, ctx.shareToken);
    if (!replaceImageSourceAtTarget(editor, target, src)) {
      toast.error(IMAGE_TARGET_MISSING_MESSAGE);
      return false;
    }
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Upload failed");
    return false;
  }
}

export function triggerFileUploadAtTarget(
  editor: Editor,
  ctx: UploadContext,
  target: ImageNodeTarget,
  onComplete?: () => void,
): void {
  if (!ctx.workspaceId) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      await uploadAndReplaceImageAtTarget(editor, ctx, file, target);
      onComplete?.();
    })();
  };
  input.click();
}
