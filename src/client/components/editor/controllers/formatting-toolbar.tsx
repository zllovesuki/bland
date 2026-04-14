import { useState, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { useTiptap, useTiptapState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Check,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Baseline,
  Highlighter,
} from "lucide-react";
import { ColorPickerPanel } from "./color-picker-panel";
import { TEXT_COLORS, BG_COLORS } from "./colors";
import { shouldShowFormattingToolbar } from "./formatting-toolbar-state";
import "../styles/floating-controls.css";

export function FormattingToolbar() {
  const { editor } = useTiptap();
  const [linkMode, setLinkMode] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [colorPanel, setColorPanel] = useState<"text" | "highlight" | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const textColorRef = useRef<HTMLButtonElement>(null);
  const highlightRef = useRef<HTMLButtonElement>(null);

  const editorState = useTiptapState((ctx) => ({
    isBold: ctx.editor.isActive("bold"),
    isItalic: ctx.editor.isActive("italic"),
    isUnderline: ctx.editor.isActive("underline"),
    isStrike: ctx.editor.isActive("strike"),
    isCode: ctx.editor.isActive("code"),
    isLink: ctx.editor.isActive("link"),
    textColor: (ctx.editor.getAttributes("textStyle").color as string) ?? null,
    bgColor: (ctx.editor.getAttributes("textStyle").backgroundColor as string) ?? null,
    isAlignCenter: ctx.editor.isActive({ textAlign: "center" }),
    isAlignRight: ctx.editor.isActive({ textAlign: "right" }),
  }));

  const shouldShow = useCallback(
    ({ editor: e, from, to }: { editor: Editor; from: number; to: number }) =>
      shouldShowFormattingToolbar({ editor: e, from, to }),
    [],
  );

  const handleLinkToggle = () => {
    if (editorState.isLink) {
      editor.chain().focus(null, { scrollIntoView: false }).unsetLink().run();
    } else {
      setLinkHref("");
      setLinkMode(true);
      setTimeout(() => linkInputRef.current?.focus(), 0);
    }
  };

  const handleLinkSubmit = () => {
    if (linkHref) {
      editor.chain().focus(null, { scrollIntoView: false }).setLink({ href: linkHref }).run();
    }
    setLinkMode(false);
  };

  const handleLinkCancel = () => {
    setLinkMode(false);
    editor.chain().focus(null, { scrollIntoView: false }).run();
  };

  if (!editor) return null;

  return (
    <BubbleMenu
      shouldShow={shouldShow}
      options={{
        placement: "top-start",
        offset: 10,
        flip: { padding: 10 },
        shift: { padding: 10 },
      }}
    >
      <div className="tiptap-toolbar" style={{ zIndex: 40 }}>
        {linkMode ? (
          <div className="flex items-center gap-1">
            <input
              ref={linkInputRef}
              type="text"
              value={linkHref}
              onChange={(e) => setLinkHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLinkSubmit();
                if (e.key === "Escape") handleLinkCancel();
              }}
              placeholder="https://..."
              className="tiptap-link-input"
            />
            <button
              type="button"
              title="Apply"
              aria-label="Apply"
              onMouseDown={(e) => {
                e.preventDefault();
                handleLinkSubmit();
              }}
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              title="Cancel"
              aria-label="Cancel"
              onMouseDown={(e) => {
                e.preventDefault();
                handleLinkCancel();
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              title="Bold"
              aria-label="Bold"
              className={editorState.isBold ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).toggleBold().run();
              }}
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              title="Italic"
              aria-label="Italic"
              className={editorState.isItalic ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).toggleItalic().run();
              }}
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              title="Underline"
              aria-label="Underline"
              className={editorState.isUnderline ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).toggleUnderline().run();
              }}
            >
              <Underline size={16} />
            </button>
            <button
              type="button"
              title="Strikethrough"
              aria-label="Strikethrough"
              className={editorState.isStrike ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).toggleStrike().run();
              }}
            >
              <Strikethrough size={16} />
            </button>
            <button
              type="button"
              title="Code"
              aria-label="Code"
              className={editorState.isCode ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).toggleCode().run();
              }}
            >
              <Code size={16} />
            </button>
            <button
              type="button"
              title="Link"
              aria-label="Link"
              className={editorState.isLink ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                handleLinkToggle();
              }}
            >
              <Link size={16} />
            </button>

            <div className="tiptap-toolbar-sep" />

            <button
              ref={textColorRef}
              type="button"
              title="Text color"
              aria-label="Text color"
              className={editorState.textColor ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setColorPanel(colorPanel === "text" ? null : "text");
              }}
            >
              <Baseline size={16} style={editorState.textColor ? { color: editorState.textColor } : undefined} />
            </button>
            <button
              ref={highlightRef}
              type="button"
              title="Highlight"
              aria-label="Highlight"
              className={editorState.bgColor ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setColorPanel(colorPanel === "highlight" ? null : "highlight");
              }}
            >
              <Highlighter size={16} style={editorState.bgColor ? { color: editorState.bgColor } : undefined} />
            </button>

            <div className="tiptap-toolbar-sep" />

            <button
              type="button"
              title="Align left"
              aria-label="Align left"
              className={!editorState.isAlignCenter && !editorState.isAlignRight ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).setTextAlign("left").run();
              }}
            >
              <AlignLeft size={16} />
            </button>
            <button
              type="button"
              title="Align center"
              aria-label="Align center"
              className={editorState.isAlignCenter ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).setTextAlign("center").run();
              }}
            >
              <AlignCenter size={16} />
            </button>
            <button
              type="button"
              title="Align right"
              aria-label="Align right"
              className={editorState.isAlignRight ? "is-active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus(null, { scrollIntoView: false }).setTextAlign("right").run();
              }}
            >
              <AlignRight size={16} />
            </button>
          </>
        )}
      </div>

      {colorPanel === "text" && (
        <ColorPickerPanel
          colors={TEXT_COLORS}
          activeColor={editorState.textColor}
          nullFallback="#d4d4d8"
          onSelect={(color) => {
            if (color) {
              editor.chain().focus(null, { scrollIntoView: false }).setColor(color).run();
            } else {
              editor.chain().focus(null, { scrollIntoView: false }).unsetColor().run();
            }
            setColorPanel(null);
          }}
          triggerRef={textColorRef}
          onClose={() => setColorPanel(null)}
        />
      )}
      {colorPanel === "highlight" && (
        <ColorPickerPanel
          colors={BG_COLORS}
          activeColor={editorState.bgColor}
          nullFallback="transparent"
          onSelect={(color) => {
            if (color) {
              editor.chain().focus(null, { scrollIntoView: false }).setBackgroundColor(color).run();
            } else {
              editor.chain().focus(null, { scrollIntoView: false }).unsetBackgroundColor().run();
            }
            setColorPanel(null);
          }}
          triggerRef={highlightRef}
          onClose={() => setColorPanel(null)}
        />
      )}
    </BubbleMenu>
  );
}
