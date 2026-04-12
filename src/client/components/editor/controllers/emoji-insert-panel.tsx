import { useEffect, useRef } from "react";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { computePosition, offset, shift, flip } from "@floating-ui/dom";
import { EmojiPicker } from "@/client/components/ui/emoji-picker";
import { insertEmoji } from "../extensions/emoji";

interface EmojiInsertPanelProps {
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

export function EmojiInsertPanel({ editor, range, pos, onClose }: EmojiInsertPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const rect = getAnchorRect(editor, pos);
    if (!rect) return;

    void computePosition({ getBoundingClientRect: () => rect }, panel, {
      placement: "bottom-start",
      middleware: [offset(10), shift({ padding: 10 }), flip({ padding: 10 })],
    }).then(({ x, y }) => {
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    });
  }, [editor, pos]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    const timeoutId = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClick, true);
    }, 0);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  return (
    <div ref={panelRef} style={{ position: "fixed", zIndex: 80 }} aria-label="Insert emoji">
      <EmojiPicker
        onSelect={(emoji) => {
          insertEmoji(editor, emoji, range);
          onClose();
        }}
      />
    </div>
  );
}

export function showEmojiInsertPanel(editor: Editor, opts: { range: Range; pos: number }) {
  let renderer: ReactRenderer<unknown, EmojiInsertPanelProps> | null = null;

  const cleanup = () => {
    editor.off("destroy", cleanup);
    renderer?.destroy();
    renderer?.element.remove();
    renderer = null;
  };

  renderer = new ReactRenderer(EmojiInsertPanel, {
    props: { editor, range: opts.range, pos: opts.pos, onClose: cleanup },
    editor,
  });
  document.body.appendChild(renderer.element);
  editor.on("destroy", cleanup);
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
