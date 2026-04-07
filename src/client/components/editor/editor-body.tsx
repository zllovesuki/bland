import { memo, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { userColor } from "@/client/hooks/use-sync";
import { EditorContext } from "./editor-context";
import { createEditorExtensions } from "./extensions/create-editor-extensions";
import { DragHandle } from "./controllers/drag-handle";
import { FormattingToolbar } from "./controllers/formatting-toolbar";
import { LinkToolbar } from "./controllers/link-toolbar";
import { ImageToolbar } from "./controllers/image-toolbar";

interface EditorBodyProps {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  pageId: string;
  readOnly?: boolean;
  shareToken?: string;
  workspaceId?: string;
}

export const EditorBody = memo(function EditorBody({
  fragment,
  provider,
  pageId,
  readOnly,
  shareToken,
  workspaceId: workspaceIdProp,
}: EditorBodyProps) {
  const user = useAuthStore((s) => s.user);
  const workspace = useWorkspaceStore((s) => s.currentWorkspace);
  const workspaceId = workspaceIdProp ?? workspace?.id;

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

  const ctxValue = useMemo(
    () => ({ workspaceId, pageId, shareToken, readOnly: !!readOnly }),
    [workspaceId, pageId, shareToken, readOnly],
  );

  return (
    <EditorContext.Provider value={ctxValue}>
      <div className="relative">
        <EditorContent editor={editor} />
        {editor && !readOnly && <DragHandle key={pageId} editor={editor} />}
        {editor && !readOnly && <FormattingToolbar editor={editor} />}
        {editor && !readOnly && <LinkToolbar editor={editor} />}
        {editor && !readOnly && <ImageToolbar editor={editor} />}
      </div>
    </EditorContext.Provider>
  );
});
