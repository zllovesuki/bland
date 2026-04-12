import type { Editor, Range } from "@tiptap/core";
import { mountEditorRenderer } from "./menu/renderer";
import { EmojiInsertPopover, type EmojiInsertPopoverProps } from "./emoji-insert-popover";

export function showEmojiInsertPanel(editor: Editor, opts: { range: Range; pos: number }) {
  // Keep launcher exports separate from the React component module so Vite Fast
  // Refresh can treat the popover as a component boundary without falling back
  // to a full invalidation on every edit.
  function cleanup() {
    renderer.destroy();
  }

  const renderer = mountEditorRenderer<unknown, EmojiInsertPopoverProps>(editor, EmojiInsertPopover, {
    editor,
    range: opts.range,
    pos: opts.pos,
    onClose: cleanup,
  });
}

export function launchEmojiPicker(editor: Editor, range: Range) {
  if (!editor.isEditable) return;

  editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).run();
  const pos = editor.state.selection.from;

  queueMicrotask(() => {
    if (editor.isDestroyed) return;
    showEmojiInsertPanel(editor, {
      range: { from: pos, to: pos },
      pos,
    });
  });
}
