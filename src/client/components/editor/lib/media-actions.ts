import type { Editor } from "@tiptap/core";
import { uploadFile } from "@/client/lib/uploads";
import { toast } from "@/client/components/toast";

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];

export interface UploadContext {
  workspaceId: string | undefined;
  pageId: string;
  shareToken: string | undefined;
}

export function resolveShareUrl(src: string, shareToken?: string): string {
  if (shareToken && src.startsWith("/uploads/")) {
    return `${src}?share=${shareToken}`;
  }
  return src;
}

export async function uploadAndInsertImage(editor: Editor, ctx: UploadContext, file: File): Promise<void> {
  if (!ctx.workspaceId) return;
  try {
    const src = await uploadFile(ctx.workspaceId, file, ctx.pageId, ctx.shareToken);
    editor.chain().focus(null, { scrollIntoView: false }).setImage({ src }).run();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Upload failed");
  }
}

export async function uploadAndInsertImageAtPos(
  editor: Editor,
  ctx: UploadContext,
  file: File,
  pos: number,
): Promise<number> {
  if (!ctx.workspaceId) return pos;
  try {
    const src = await uploadFile(ctx.workspaceId, file, ctx.pageId, ctx.shareToken);
    editor.chain().focus(null, { scrollIntoView: false }).insertContentAt(pos, { type: "image", attrs: { src } }).run();
    return editor.state.selection.to + 1;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Upload failed");
    return pos;
  }
}

export function triggerFileUpload(editor: Editor, ctx: UploadContext, onComplete?: () => void): void {
  if (!ctx.workspaceId) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      await uploadAndInsertImage(editor, ctx, file);
      onComplete?.();
    })();
  };
  input.click();
}
