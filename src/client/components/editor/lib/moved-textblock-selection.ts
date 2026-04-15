import { NodeSelection, TextSelection, type Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

function scheduleFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }

  queueMicrotask(() => callback(0));
  return 0;
}

export function getMovedTextblockCursorPos(selection: Selection): number | null {
  if (!(selection instanceof NodeSelection) || !selection.node.isTextblock) {
    return null;
  }

  return Math.max(selection.from + 1, selection.to - 1);
}

function finalizeMovedTextblockSelection(view: EditorView): boolean {
  view.updateState(view.state);

  const cursorPos = getMovedTextblockCursorPos(view.state.selection);
  if (cursorPos === null) return false;

  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, cursorPos)).setMeta("addToHistory", false),
  );
  return true;
}

export function scheduleMovedTextblockSelectionFinalization(view: EditorView) {
  scheduleFrame(() => {
    if (view.isDestroyed) return;
    finalizeMovedTextblockSelection(view);
  });
}
