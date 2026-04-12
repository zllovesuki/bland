import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

type InternalDraggingState = NonNullable<EditorView["dragging"]> & {
  node?: NodeSelection;
};

type BlockDragView = Pick<EditorView, "dispatch" | "state"> & {
  dragging: InternalDraggingState | null;
};

export function primeTopLevelBlockDragState(view: BlockDragView, pos: number): boolean {
  if (pos < 0 || pos > view.state.doc.content.size) {
    return false;
  }

  const node = view.state.doc.nodeAt(pos);
  if (!node || !NodeSelection.isSelectable(node)) {
    return false;
  }

  const selection = NodeSelection.create(view.state.doc, pos);
  view.dragging = {
    slice: view.state.doc.slice(pos, pos + node.nodeSize),
    move: true,
    node: selection,
  };
  view.dispatch(view.state.tr.setSelection(selection));
  return true;
}
