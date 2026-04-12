import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";

export type FormattingToolbarEditor = Pick<Editor, "state" | "isActive"> & {
  view: Pick<Editor["view"], "dragging">;
};

interface ShouldShowFormattingToolbarArgs {
  editor: FormattingToolbarEditor;
  from: number;
  to: number;
}

function selectionTouchesDetailsSummary(editor: FormattingToolbarEditor, from: number, to: number) {
  let touchesDetailsSummary = false;

  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name !== "detailsSummary") {
      return !touchesDetailsSummary;
    }

    touchesDetailsSummary = true;
    return false;
  });

  return touchesDetailsSummary;
}

export function shouldShowFormattingToolbar({ editor, from, to }: ShouldShowFormattingToolbarArgs) {
  if (from === to || editor.view.dragging) return false;
  if (editor.state.selection instanceof NodeSelection) return false;
  if (editor.isActive("codeBlock")) return false;
  if (selectionTouchesDetailsSummary(editor, from, to)) return false;
  return true;
}
