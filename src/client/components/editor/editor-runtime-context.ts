import { createContext, use } from "react";

export interface EditorRuntimeSnapshot {
  workspaceId: string | undefined;
  pageId: string;
  shareToken: string | undefined;
}

export type EditorRuntimeContextValue = EditorRuntimeSnapshot;

const EMPTY_RUNTIME: EditorRuntimeSnapshot = {
  workspaceId: undefined,
  pageId: "",
  shareToken: undefined,
};

export const EditorRuntimeContext = createContext<EditorRuntimeContextValue>({
  ...EMPTY_RUNTIME,
});

export function useEditorRuntime(): EditorRuntimeContextValue {
  return use(EditorRuntimeContext);
}
