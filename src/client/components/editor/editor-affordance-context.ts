import { createContext, useContext } from "react";
import type { EditorAffordance } from "@/client/lib/affordance/editor";

const EMPTY_AFFORDANCE: EditorAffordance = {
  documentEditable: false,
  canInsertPageMentions: false,
  canInsertImages: false,
};

export const EditorAffordanceContext = createContext<EditorAffordance>(EMPTY_AFFORDANCE);

export function useEditorAffordance(): EditorAffordance {
  return useContext(EditorAffordanceContext);
}
