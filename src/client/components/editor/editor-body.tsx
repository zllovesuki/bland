import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Tiptap, useEditor } from "@tiptap/react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { useCollabIdentity } from "@/client/lib/collab-identity";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
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
import { getInsertablePageMentionCandidates } from "@/client/components/page-mention/candidates";
import "@/styles/editor/content.css";
import "@/styles/editor/table.css";
import "@/styles/editor/details.css";
import "@/styles/editor/callout.css";
import "@/styles/editor/emoji.css";
import "./styles/menu.css";
import "@/styles/editor/page-mention.css";

export type EditorOutlinePlacement = { kind: "inline" } | { kind: "rail"; target: HTMLDivElement | null };

interface EditorBodyProps {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  pageId: string;
  shareToken?: string;
  workspaceId?: string;
  affordance: EditorAffordance;
  onSchemaError?: (error: Error) => void;
  outline?: EditorOutlinePlacement;
  docFooterLeading?: ReactNode;
}

export const EditorBody = memo(function EditorBody({
  fragment,
  provider,
  pageId,
  shareToken,
  workspaceId,
  affordance,
  onSchemaError,
  outline = { kind: "inline" },
  docFooterLeading,
}: EditorBodyProps) {
  const { userId, resolveIdentity } = useCollabIdentity();
  const resolveIdentityRef = useRef(resolveIdentity);
  useLayoutEffect(() => {
    resolveIdentityRef.current = resolveIdentity;
  }, [resolveIdentity]);
  const getResolveIdentity = useCallback<ResolveIdentity>(
    (lookupUserId, clientId) => resolveIdentityRef.current(lookupUserId, clientId),
    [],
  );
  const pageMentions = usePageMentions();
  const affordanceRef = useRef(affordance);
  useLayoutEffect(() => {
    affordanceRef.current = affordance;
  }, [affordance]);
  const runtimeRef = useRef<EditorRuntimeSnapshot>({
    workspaceId,
    pageId,
    shareToken,
  });
  useLayoutEffect(() => {
    runtimeRef.current = {
      workspaceId,
      pageId,
      shareToken,
    };
  }, [pageId, shareToken, workspaceId]);

  const getRuntime = useCallback(() => runtimeRef.current, []);
  const getAffordance = useCallback(() => affordanceRef.current, []);
  const collaborationUser = useMemo(
    () => ({
      userId,
    }),
    [userId],
  );

  const editor = useEditor(
    {
      extensions: createEditorExtensions({
        fragment,
        provider,
        user: collaborationUser,
        resolveIdentity: getResolveIdentity,
        getRuntime,
        getAffordance,
        getPageMentionCandidates: (excludePageId) => {
          const runtime = getRuntime();
          if (runtime.shareToken) return [];
          return getInsertablePageMentionCandidates(runtime.workspaceId, excludePageId);
        },
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
          class: "tiptap tiptap-document-lead tiptap-editor-surface tiptap-page-body",
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
    [fragment, getAffordance, getResolveIdentity, getRuntime, provider],
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

  const outlineContent = outline.kind === "rail" ? <EditorOutline variant="rail" /> : <EditorOutline />;

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
              {outline.kind === "inline" ? outlineContent : null}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                {docFooterLeading ?? <span aria-hidden="true" />}
                <EditorMetrics />
              </div>
            </div>
            {outline.kind === "rail" && outline.target ? createPortal(outlineContent, outline.target) : null}
          </Tiptap>
        </PageMentionContext.Provider>
      </EditorAffordanceContext.Provider>
    </EditorRuntimeContext.Provider>
  );
});
