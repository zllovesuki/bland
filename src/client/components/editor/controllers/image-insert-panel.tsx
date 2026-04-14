import type { Editor, Range } from "@tiptap/core";
import { mountEditorRenderer } from "./menu/renderer";
import { type ImageNodeTarget, type UploadContext, insertImagePlaceholderAtRange } from "../lib/media-actions";
import { ImageInsertPopover, type ImageInsertPopoverProps } from "./image-insert-popover";

export function insertImageFromSlashMenu(editor: Editor, range: Range, uploadContext: UploadContext) {
  const inserted = insertImagePlaceholderAtRange(editor, range);
  if (!inserted) return;

  queueMicrotask(() => {
    if (editor.isDestroyed) return;
    showImageInsertPanel(editor, { uploadContext, target: inserted.target });
  });
}

export function showImageInsertPanel(editor: Editor, opts: { uploadContext: UploadContext; target: ImageNodeTarget }) {
  // Keep launcher exports separate from the React component module so Vite Fast
  // Refresh can hot-update the popover implementation without flagging the
  // command-style exports in this module as incompatible.
  function cleanup() {
    renderer.destroy();
  }

  const renderer = mountEditorRenderer<unknown, ImageInsertPopoverProps>(editor, ImageInsertPopover, {
    editor,
    uploadContext: opts.uploadContext,
    target: opts.target,
    onClose: cleanup,
  });
}
