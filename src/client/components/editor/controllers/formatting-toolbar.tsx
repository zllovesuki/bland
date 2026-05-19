import { useState, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { useTiptap, useTiptapState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { CellSelection } from "@tiptap/pm/tables";
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
  Merge,
  Split,
  Sparkles,
} from "lucide-react";
import { ColorPickerPanel } from "./color-picker-panel";
import { TEXT_COLORS, BG_COLORS } from "./colors";
import { shouldShowFormattingToolbar } from "./formatting-toolbar-state";
import { AiMenuPanel } from "./ai-menu";
import { runRewrite } from "./ai-rewrite";
import { ToolbarButton } from "./toolbar-button";
import { getAiBusyReason } from "../lib/ai-busy";
import { useEditorAffordance } from "../editor-affordance-context";
import { useEditorRuntime } from "../editor-runtime-context";
import "../styles/floating-controls.css";

export function FormattingToolbar() {
  const { editor } = useTiptap();
  const affordance = useEditorAffordance();
  const runtime = useEditorRuntime();
  const [linkMode, setLinkMode] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [colorPanel, setColorPanel] = useState<"text" | "highlight" | null>(null);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const textColorRef = useRef<HTMLButtonElement>(null);
  const highlightRef = useRef<HTMLButtonElement>(null);
  const aiButtonRef = useRef<HTMLButtonElement>(null);

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
    isCellSelection: ctx.editor.state.selection instanceof CellSelection,
    canMerge: ctx.editor.can().mergeCells(),
    canSplit: ctx.editor.can().splitCell(),
    aiBlockedReason: getAiBusyReason(ctx.editor.state),
    shouldShowToolbar: shouldShowFormattingToolbar({
      editor: ctx.editor,
      from: ctx.editor.state.selection.from,
      to: ctx.editor.state.selection.to,
    }),
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

  const effectiveColorPanel = linkMode || !editorState.shouldShowToolbar ? null : colorPanel;
  const effectiveAiMenuOpen =
    linkMode || !editorState.shouldShowToolbar || editorState.aiBlockedReason ? false : aiMenuOpen;

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
      <div className="tiptap-toolbar">
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
            <ToolbarButton title="Apply" onActivate={handleLinkSubmit}>
              <Check size={14} />
            </ToolbarButton>
            <ToolbarButton title="Cancel" onActivate={handleLinkCancel}>
              <X size={14} />
            </ToolbarButton>
          </div>
        ) : (
          <>
            <ToolbarButton
              title="Bold"
              active={editorState.isBold}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).toggleBold().run()}
            >
              <Bold size={16} />
            </ToolbarButton>
            <ToolbarButton
              title="Italic"
              active={editorState.isItalic}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).toggleItalic().run()}
            >
              <Italic size={16} />
            </ToolbarButton>
            <ToolbarButton
              title="Underline"
              active={editorState.isUnderline}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).toggleUnderline().run()}
            >
              <Underline size={16} />
            </ToolbarButton>
            <ToolbarButton
              title="Strikethrough"
              active={editorState.isStrike}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).toggleStrike().run()}
            >
              <Strikethrough size={16} />
            </ToolbarButton>
            <ToolbarButton
              title="Code"
              active={editorState.isCode}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).toggleCode().run()}
            >
              <Code size={16} />
            </ToolbarButton>
            <ToolbarButton title="Link" active={editorState.isLink} onActivate={handleLinkToggle}>
              <Link size={16} />
            </ToolbarButton>

            <div className="tiptap-toolbar-sep" />

            <ToolbarButton
              ref={textColorRef}
              title="Text color"
              active={Boolean(editorState.textColor)}
              onActivate={() => setColorPanel(colorPanel === "text" ? null : "text")}
            >
              <Baseline size={16} style={editorState.textColor ? { color: editorState.textColor } : undefined} />
            </ToolbarButton>
            <ToolbarButton
              ref={highlightRef}
              title="Highlight"
              active={Boolean(editorState.bgColor)}
              onActivate={() => setColorPanel(colorPanel === "highlight" ? null : "highlight")}
            >
              <Highlighter size={16} style={editorState.bgColor ? { color: editorState.bgColor } : undefined} />
            </ToolbarButton>

            <div className="tiptap-toolbar-sep" />

            <ToolbarButton
              title="Align left"
              active={!editorState.isAlignCenter && !editorState.isAlignRight}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).setTextAlign("left").run()}
            >
              <AlignLeft size={16} />
            </ToolbarButton>
            <ToolbarButton
              title="Align center"
              active={editorState.isAlignCenter}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).setTextAlign("center").run()}
            >
              <AlignCenter size={16} />
            </ToolbarButton>
            <ToolbarButton
              title="Align right"
              active={editorState.isAlignRight}
              onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).setTextAlign("right").run()}
            >
              <AlignRight size={16} />
            </ToolbarButton>

            {affordance.canUseAiRewrite ? (
              <>
                <div className="tiptap-toolbar-sep" />
                <ToolbarButton
                  ref={aiButtonRef}
                  title={editorState.aiBlockedReason ?? "AI actions"}
                  disabled={Boolean(editorState.aiBlockedReason)}
                  active={effectiveAiMenuOpen}
                  onActivate={() => setAiMenuOpen((prev) => !prev)}
                >
                  <Sparkles size={16} />
                </ToolbarButton>
              </>
            ) : null}

            {editorState.isCellSelection && (
              <>
                <div className="tiptap-toolbar-sep" />
                <ToolbarButton
                  title="Merge cells"
                  disabled={!editorState.canMerge}
                  onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).mergeCells().run()}
                >
                  <Merge size={16} />
                </ToolbarButton>
                <ToolbarButton
                  title="Split cell"
                  disabled={!editorState.canSplit}
                  onActivate={() => editor.chain().focus(null, { scrollIntoView: false }).splitCell().run()}
                >
                  <Split size={16} />
                </ToolbarButton>
              </>
            )}
          </>
        )}
      </div>

      {effectiveColorPanel === "text" && (
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
      {effectiveColorPanel === "highlight" && (
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
      {effectiveAiMenuOpen && (
        <AiMenuPanel
          triggerRef={aiButtonRef}
          onClose={() => setAiMenuOpen(false)}
          onSelect={(action) => {
            setAiMenuOpen(false);
            void runRewrite({ editor, action, runtime });
          }}
        />
      )}
    </BubbleMenu>
  );
}
