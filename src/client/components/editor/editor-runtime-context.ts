import { createContext, useContext } from "react";
import { canInsertPageMentions } from "./lib/page-mention/can-insert";
import type { UploadContext } from "./lib/media-actions";

export interface EditorRuntimeSnapshot {
  workspaceId: string | undefined;
  pageId: string;
  shareToken: string | undefined;
  readOnly: boolean;
}

export interface EditorRuntimeContextValue extends EditorRuntimeSnapshot {
  getRuntime(): EditorRuntimeSnapshot;
  getUploadContext(): UploadContext;
  canInsertPageMentions(): boolean;
}

const EMPTY_RUNTIME: EditorRuntimeSnapshot = {
  workspaceId: undefined,
  pageId: "",
  shareToken: undefined,
  readOnly: false,
};

export const EditorRuntimeContext = createContext<EditorRuntimeContextValue>({
  ...EMPTY_RUNTIME,
  getRuntime: () => EMPTY_RUNTIME,
  getUploadContext: () => ({
    workspaceId: undefined,
    pageId: "",
    shareToken: undefined,
  }),
  canInsertPageMentions: () => false,
});

export function useEditorRuntime(): EditorRuntimeContextValue {
  return useContext(EditorRuntimeContext);
}

export function canInsertPageMentionsForRuntime(runtime: EditorRuntimeSnapshot): boolean {
  return canInsertPageMentions({
    editable: !runtime.readOnly,
    workspaceId: runtime.workspaceId,
    shareToken: runtime.shareToken,
  });
}
