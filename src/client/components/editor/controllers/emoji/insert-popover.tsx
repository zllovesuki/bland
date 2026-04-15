import { FloatingPortal } from "@floating-ui/react";
import type { Editor, Range } from "@tiptap/core";
import { EmojiPicker } from "@/client/components/ui/emoji-picker";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "../menu/popover";
import { insertEmoji } from "../../extensions/emoji";

export interface EmojiInsertPopoverProps {
  editor: Editor;
  range: Range;
  pos: number;
  onClose: () => void;
}

function getAnchorRect(editor: Editor, pos: number): DOMRect | null {
  try {
    const coords = editor.view.coordsAtPos(pos);
    return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
  } catch {
    return null;
  }
}

export function EmojiInsertPopover({ editor, range, pos, onClose }: EmojiInsertPopoverProps) {
  const { floatingStyles, setFloating } = useEditorRectPopover({
    open: true,
    onClose,
    getAnchorRect: () => getAnchorRect(editor, pos),
    contextElement: editor.view.dom,
    deferOutsidePress: true,
  });

  return (
    <FloatingPortal>
      <div
        ref={setFloating}
        style={{ ...floatingStyles, zIndex: 80 }}
        aria-label="Insert emoji"
        onMouseDownCapture={(event) => preserveEditorSelectionOnMouseDown(event)}
      >
        <EmojiPicker
          onSelect={(emoji) => {
            insertEmoji(editor, emoji, range);
            onClose();
          }}
        />
      </div>
    </FloatingPortal>
  );
}
