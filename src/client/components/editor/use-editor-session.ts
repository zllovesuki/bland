import * as Y from "yjs";
import type YProvider from "y-partyserver/provider";
import { getCachedDocKey } from "@/client/lib/constants";
import { useDocSyncSession, type DocSyncSessionState } from "@/client/lib/doc-sync-session";
import { YJS_DOCUMENT_STORE } from "@/shared/constants";

interface EditorRuntime {
  fragment: Y.XmlFragment;
}

export type EditorSessionState = DocSyncSessionState<EditorRuntime>;
export type EditorSessionLoadingState = Extract<EditorSessionState, { kind: "loading" }>;
export type EditorSessionReadyState = Extract<EditorSessionState, { kind: "ready" }>;
export type EditorSessionErrorState = Extract<EditorSessionState, { kind: "error" }>;

interface UseEditorSessionOptions {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  enabled?: boolean;
}

function editorRoots(ydoc: Y.Doc): EditorRuntime {
  return { fragment: ydoc.getXmlFragment(YJS_DOCUMENT_STORE) };
}

function editorHasBody({ fragment }: EditorRuntime): boolean {
  return fragment.length > 0;
}

export function useEditorSession(opts: UseEditorSessionOptions): EditorSessionState {
  return useDocSyncSession<EditorRuntime>({
    pageId: opts.pageId,
    initialTitle: opts.initialTitle,
    onTitleChange: opts.onTitleChange,
    onProvider: opts.onProvider,
    shareToken: opts.shareToken,
    workspaceId: opts.workspaceId,
    enabled: opts.enabled,
    cacheKey: getCachedDocKey(opts.pageId),
    errorSource: "editor.snapshot-bootstrap",
    roots: editorRoots,
    hasBody: editorHasBody,
  });
}
