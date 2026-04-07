import { useState, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
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

export function FormattingToolbar({ editor }: { editor: Editor }) {
  const [linkMode, setLinkMode] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [colorPanel, setColorPanel] = useState<"text" | "highlight" | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const textColorRef = useRef<HTMLButtonElement>(null);
  const highlightRef = useRef<HTMLButtonElement>(null);

  const editorState = useEditorState({
    editor,
    selector: (ctx) => ({
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
    }),
  });

  const shouldShow = useCallback(({ editor: e, from, to }: { editor: Editor; from: number; to: number }) => {
    if (from === to || e.view.dragging) return false;
    if (e.state.selection instanceof NodeSelection) return false;
    if (e.isActive("codeBlock")) return false;
    return true;
  }, []);

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

  return (
    <BubbleMenu
      editor={editor}
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
