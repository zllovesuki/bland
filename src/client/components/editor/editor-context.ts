import { createContext } from "react";

export interface EditorContextValue {
  workspaceId: string | undefined;
  pageId: string;
  shareToken: string | undefined;
  readOnly: boolean;
}

export const EditorContext = createContext<EditorContextValue>({
  workspaceId: undefined,
  pageId: "",
  shareToken: undefined,
  readOnly: false,
});
