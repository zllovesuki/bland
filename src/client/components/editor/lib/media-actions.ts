import type { Editor, JSONContent, Range } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { uploadFile } from "@/client/lib/uploads";
import { toast } from "@/client/components/toast";
import { MAX_UPLOAD_SIZE } from "@/shared/constants";
import type { EditorRuntimeSnapshot } from "../editor-runtime-context";
import type { EditorAffordance } from "@/client/lib/affordance/editor";

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];
const IMAGE_MIME_SET = new Set<string>(IMAGE_MIME_TYPES);
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

const localImagePreviews = new Map<string, string>();

export function getLocalImagePreview(pendingInsertId: string | null): string | null {
  if (pendingInsertId === null) return null;
  return localImagePreviews.get(pendingInsertId) ?? null;
}

function setLocalImagePreview(pendingInsertId: string, blobUrl: string): void {
  const existing = localImagePreviews.get(pendingInsertId);
  if (existing && existing !== blobUrl) URL.revokeObjectURL(existing);
  localImagePreviews.set(pendingInsertId, blobUrl);
}

function clearLocalImagePreview(pendingInsertId: string): void {
  const existing = localImagePreviews.get(pendingInsertId);
  if (!existing) return;
  URL.revokeObjectURL(existing);
  localImagePreviews.delete(pendingInsertId);
}

function validateImageFile(file: File): void {
  if (!IMAGE_MIME_SET.has(file.type)) throw new Error("File type not allowed");
  if (file.size > MAX_UPLOAD_SIZE) throw new Error("File too large (max 10MB)");
}

async function probeImageDimensions(file: File): Promise<{ naturalWidth: number; naturalHeight: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ naturalWidth: number; naturalHeight: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface CreateImageFileHandlerConfigOptions {
  getRuntime: () => EditorRuntimeSnapshot;
  getAffordance: () => EditorAffordance;
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

export function runtimeToUploadContext(runtime: EditorRuntimeSnapshot): UploadContext {
  return {
    workspaceId: runtime.workspaceId,
    pageId: runtime.pageId,
    shareToken: runtime.shareToken,
  };
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

function collectImageTargetsAtRange(editor: Editor, range: Range, fileCount: number): ImageNodeTarget[] {
  const targets: ImageNodeTarget[] = [];
  const first = insertImagePlaceholderAtRange(editor, range);
  if (!first) return targets;

  targets.push(first.target);
  let insertPos = first.nextPos;
  for (const _file of Array.from({ length: Math.max(0, fileCount - 1) })) {
    const placeholder = insertImagePlaceholderAtPos(editor, insertPos);
    if (!placeholder) break;
    targets.push(placeholder.target);
    insertPos = placeholder.nextPos;
  }

  return targets;
}

function collectImageTargetsAtPos(editor: Editor, pos: number, fileCount: number): ImageNodeTarget[] {
  const targets: ImageNodeTarget[] = [];
  let insertPos = pos;

  for (const _file of Array.from({ length: fileCount })) {
    const placeholder = insertImagePlaceholderAtPos(editor, insertPos);
    if (!placeholder) break;
    targets.push(placeholder.target);
    insertPos = placeholder.nextPos;
  }

  return targets;
}

async function uploadFilesAtTargets(editor: Editor, ctx: UploadContext, files: File[], targets: ImageNodeTarget[]) {
  for (const [index, file] of files.entries()) {
    const target = targets[index];
    if (!target) break;
    await uploadAndReplaceImageAtTarget(editor, ctx, file, target);
  }
}

export function createImageFileHandlerConfig({ getRuntime, getAffordance }: CreateImageFileHandlerConfigOptions) {
  return {
    allowedMimeTypes: IMAGE_MIME_TYPES,
    onPaste: (editor: Editor, files: File[]) => {
      const runtime = getRuntime();
      if (!editor.isEditable || !getAffordance().canInsertImages || !runtime.workspaceId || files.length === 0) return;

      const targets = collectImageTargetsAtRange(editor, editor.state.selection, files.length);
      if (targets.length === 0) return;

      void uploadFilesAtTargets(editor, runtimeToUploadContext(runtime), files, targets);
    },
    onDrop: (editor: Editor, files: File[], pos: number) => {
      const runtime = getRuntime();
      if (!editor.isEditable || !getAffordance().canInsertImages || !runtime.workspaceId || files.length === 0) return;

      const targets = collectImageTargetsAtPos(editor, pos, files.length);
      if (targets.length === 0) return;

      void uploadFilesAtTargets(editor, runtimeToUploadContext(runtime), files, targets);
    },
  };
}

export async function uploadAndReplaceImageAtTarget(
  editor: Editor,
  ctx: UploadContext,
  file: File,
  target: ImageNodeTarget,
): Promise<boolean> {
  if (!ctx.workspaceId) return false;
  if (resolveImageTargetPos(editor, target) === null) {
    toast.error(IMAGE_TARGET_MISSING_MESSAGE);
    return false;
  }

  try {
    validateImageFile(file);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Upload failed");
    return false;
  }

  const pendingInsertId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const markerSet = updateImageAttributesAtTarget(editor, target, { pendingInsertId });
  if (!markerSet) {
    toast.error(IMAGE_TARGET_MISSING_MESSAGE);
    return false;
  }

  setLocalImagePreview(pendingInsertId, URL.createObjectURL(file));

  try {
    const dims = await probeImageDimensions(file);
    if (dims) {
      updateImageAttributesAtTarget(editor, target, {
        naturalWidth: dims.naturalWidth,
        naturalHeight: dims.naturalHeight,
      });
    }

    const src = await uploadFile(ctx.workspaceId, file, ctx.pageId, ctx.shareToken);
    if (!replaceImageSourceAtTarget(editor, target, src)) {
      toast.error(IMAGE_TARGET_MISSING_MESSAGE);
      return false;
    }
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Upload failed");
    updateImageAttributesAtTarget(editor, target, { pendingInsertId: null });
    return false;
  } finally {
    clearLocalImagePreview(pendingInsertId);
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
