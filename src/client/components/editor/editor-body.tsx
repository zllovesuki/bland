import { memo, useEffect, useMemo } from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { useAuthStore } from "@/client/stores/auth-store";
import { userColor } from "@/client/hooks/use-sync";
import { EditorContext } from "./editor-context";
import { createEditorExtensions } from "./extensions/create-editor-extensions";
import { DragHandle } from "./controllers/drag-handle";
import { FormattingToolbar } from "./controllers/formatting-toolbar";
import { LinkToolbar } from "./controllers/link-toolbar";
import { ImageToolbar } from "./controllers/image-toolbar";
import { TableMenu } from "./controllers/table-menu";
import { EDITOR_CORE_EXTENSION_OPTIONS } from "./lib/clipboard";
import { PageMentionContext } from "./page-mention-context";
import { usePageMentionScope } from "./page-mention-scope-context";
import "./styles/content.css";
import "./styles/table.css";
import "./styles/details.css";
import "./styles/emoji.css";
import "./styles/menu.css";
import "./styles/page-mention.css";

interface EditorBodyProps {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  pageId: string;
  readOnly?: boolean;
  shareToken?: string;
  workspaceId?: string;
  onEditor?: (editor: TiptapEditor | null) => void;
}

export const EditorBody = memo(function EditorBody({
  fragment,
  provider,
  pageId,
  readOnly,
  shareToken,
  workspaceId,
  onEditor,
}: EditorBodyProps) {
  const user = useAuthStore((s) => s.user);
  const pageMentionScope = usePageMentionScope();

  const editor = useEditor(
    {
      extensions: createEditorExtensions({
        fragment,
        provider,
        user: {
          name: user?.name ?? "Anonymous",
          color: userColor(user?.id ?? "anon"),
          avatar_url: user?.avatar_url ?? null,
        },
        workspaceId,
        pageId,
        shareToken,
      }),
      editable: !readOnly,
      coreExtensionOptions: EDITOR_CORE_EXTENSION_OPTIONS,
      editorProps: {
        attributes: {
          class: "tiptap",
        },
        // ProseMirror's built-in commands (splitBlock, deleteNode, typing, etc.)
        // call tr.scrollIntoView() which feeds into scrollRectIntoView — an
        // aggressive helper that walks every scrollable ancestor and can cause
        // jarring jumps. We take full control: suppress ProseMirror's default
        // scroll and only nudge the scroll container when the cursor is truly
        // at the edge.
        handleScrollToSelection(view) {
          let scrollEl: HTMLElement | null = view.dom.parentElement;
          while (
            scrollEl &&
            scrollEl !== document.body &&
            getComputedStyle(scrollEl).overflowY !== "auto" &&
            getComputedStyle(scrollEl).overflowY !== "scroll"
          ) {
            scrollEl = scrollEl.parentElement;
          }
          if (!scrollEl || scrollEl === document.body) return true;
          let coords;
          try {
            coords = view.coordsAtPos(view.state.selection.from);
          } catch {
            return true;
          }
          if (coords.top === 0 && coords.bottom === 0) return true;
          const rect = scrollEl.getBoundingClientRect();
          const margin = 40;
          if (coords.top < rect.top + margin) {
            scrollEl.scrollTop -= rect.top + margin - coords.top;
          } else if (coords.bottom > rect.bottom - margin) {
            scrollEl.scrollTop += coords.bottom - (rect.bottom - margin);
          }
          return true;
        },
      },
    },
    [pageId],
  );

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    onEditor?.(editor ?? null);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  const ctxValue = useMemo(
    () => ({ workspaceId, pageId, shareToken, readOnly: !!readOnly }),
    [workspaceId, pageId, shareToken, readOnly],
  );

  return (
    <EditorContext.Provider value={ctxValue}>
      {/* Tiptap node views are rendered through EditorContent's React bridge.
          Re-providing the existing mention scope here keeps the stable
          route-level resolver lifetime while ensuring node views can still
          consume PageMentionContext. */}
      <PageMentionContext.Provider value={pageMentionScope}>
        <div className="relative">
          <EditorContent editor={editor} />
          {editor && !readOnly && <DragHandle key={pageId} editor={editor} />}
          {editor && !readOnly && <FormattingToolbar editor={editor} />}
          {editor && !readOnly && <LinkToolbar editor={editor} />}
          {editor && !readOnly && <ImageToolbar editor={editor} />}
          {editor && !readOnly && <TableMenu editor={editor} />}
        </div>
      </PageMentionContext.Provider>
    </EditorContext.Provider>
  );
});
