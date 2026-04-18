import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Tiptap, useEditor } from "@tiptap/react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { useAuthStore } from "@/client/stores/auth-store";
import { userColor } from "@/client/hooks/use-sync";
import { createEditorExtensions } from "./extensions/create-editor-extensions";
import { DragHandle } from "./controllers/drag-handle";
import { FormattingToolbar } from "./controllers/formatting-toolbar";
import { LinkToolbar } from "./controllers/link-toolbar";
import { ImageToolbar } from "./controllers/image/toolbar";
import { TableMenu } from "./controllers/table-menu";
import { EDITOR_CORE_EXTENSION_OPTIONS } from "./lib/clipboard";
import { EditorAffordanceContext } from "./editor-affordance-context";
import { EditorRuntimeContext, type EditorRuntimeSnapshot } from "./editor-runtime-context";
import { EditorMetrics } from "./editor-metrics";
import { EditorOutline } from "./editor-outline";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import { PageMentionContext, usePageMentions } from "@/client/components/page-mention/context";
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
  shareToken?: string;
  workspaceId?: string;
  affordance: EditorAffordance;
  onSchemaError?: (error: Error) => void;
  /** DOM node for portalling the outline into a right-rail container (xl+). */
  outlinePortalTarget?: HTMLDivElement | null;
}

export const EditorBody = memo(function EditorBody({
  fragment,
  provider,
  pageId,
  shareToken,
  workspaceId,
  affordance,
  onSchemaError,
  outlinePortalTarget,
}: EditorBodyProps) {
  const user = useAuthStore((s) => s.user);
  const pageMentions = usePageMentions();
  const affordanceRef = useRef(affordance);
  affordanceRef.current = affordance;
  const runtimeRef = useRef<EditorRuntimeSnapshot>({
    workspaceId,
    pageId,
    shareToken,
  });
  runtimeRef.current = {
    workspaceId,
    pageId,
    shareToken,
  };

  const getRuntime = useCallback(() => runtimeRef.current, []);
  const getAffordance = useCallback(() => affordanceRef.current, []);
  const collaborationUser = useMemo(
    () => ({
      name: user?.name ?? "Anonymous",
      color: userColor(user?.id ?? "anon"),
      avatar_url: user?.avatar_url ?? null,
    }),
    [user?.avatar_url, user?.id, user?.name],
  );

  const editor = useEditor(
    {
      extensions: createEditorExtensions({
        fragment,
        provider,
        user: collaborationUser,
        getRuntime,
        getAffordance,
        getPageMentionCandidates: (excludePageId) => pageMentions.getInsertablePages(excludePageId),
      }),
      editable: affordance.documentEditable,
      enableContentCheck: true,
      shouldRerenderOnTransaction: false,
      coreExtensionOptions: EDITOR_CORE_EXTENSION_OPTIONS,
      onContentError: ({ editor, error, disableCollaboration }) => {
        // Fail closed for collaborative schema mismatches so an older client
        // never syncs destructive edits back into the shared document.
        disableCollaboration();
        editor.setEditable(false, false);
        onSchemaError?.(error);
      },
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
    [fragment, getAffordance, pageId, pageMentions, provider],
  );

  useEffect(() => {
    if (editor) editor.setEditable(affordance.documentEditable);
  }, [editor, affordance.documentEditable]);

  useEffect(() => {
    provider.awareness.setLocalStateField("user", collaborationUser);
  }, [collaborationUser, provider]);

  const runtimeValue = useMemo(
    () => ({
      workspaceId,
      pageId,
      shareToken,
    }),
    [pageId, shareToken, workspaceId],
  );

  if (!editor) return null;

  return (
    <EditorRuntimeContext.Provider value={runtimeValue}>
      <EditorAffordanceContext.Provider value={affordance}>
        {/* Tiptap node views are rendered through EditorContent's React bridge.
            Re-providing the existing mention scope here keeps the stable
            route-level resolver lifetime while ensuring node views can still
            consume PageMentionContext. */}
        <PageMentionContext.Provider value={pageMentions}>
          <Tiptap editor={editor}>
            <div className="relative">
              <Tiptap.Content />
              {affordance.documentEditable && <DragHandle />}
              {affordance.documentEditable && <FormattingToolbar />}
              {affordance.documentEditable && <LinkToolbar />}
              {affordance.documentEditable && <ImageToolbar />}
              {affordance.documentEditable && <TableMenu />}
            </div>
            <div className="mt-4 space-y-4 pl-4 sm:pl-7">
              <div className={outlinePortalTarget ? "xl:hidden" : undefined}>
                <EditorOutline />
              </div>
              <EditorMetrics className="justify-end" />
            </div>
            {outlinePortalTarget &&
              createPortal(<EditorOutline className="tiptap-outline--rail" />, outlinePortalTarget)}
          </Tiptap>
        </PageMentionContext.Provider>
      </EditorAffordanceContext.Provider>
    </EditorRuntimeContext.Provider>
  );
});
