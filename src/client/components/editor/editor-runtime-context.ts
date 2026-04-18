import { createContext, useContext } from "react";
import type { UploadContext } from "./lib/media-actions";

export interface EditorRuntimeSnapshot {
  workspaceId: string | undefined;
  pageId: string;
  shareToken: string | undefined;
}

export interface EditorRuntimeContextValue extends EditorRuntimeSnapshot {
  getRuntime(): EditorRuntimeSnapshot;
  getUploadContext(): UploadContext;
}

const EMPTY_RUNTIME: EditorRuntimeSnapshot = {
  workspaceId: undefined,
  pageId: "",
  shareToken: undefined,
};

export const EditorRuntimeContext = createContext<EditorRuntimeContextValue>({
  ...EMPTY_RUNTIME,
  getRuntime: () => EMPTY_RUNTIME,
  getUploadContext: () => ({
    workspaceId: undefined,
    pageId: "",
    shareToken: undefined,
  }),
});

export function useEditorRuntime(): EditorRuntimeContextValue {
  return useContext(EditorRuntimeContext);
}
