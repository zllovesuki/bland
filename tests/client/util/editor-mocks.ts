import type { Editor } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { vi } from "vitest";
import type { FormattingToolbarEditor } from "@/client/components/editor/controllers/formatting-toolbar-state";

export function createDispatchingTestEditor(schema: Schema, doc: PMNode) {
  let state = EditorState.create({ schema, doc });
  const focus = vi.fn();
  const updateState = vi.fn((nextState: EditorState) => {
    state = nextState;
    view.state = nextState;
  });

  const view = {
    state,
    isDestroyed: false,
    dispatch(tr: Transaction) {
      state = state.apply(tr);
      view.state = state;
    },
    focus,
    updateState,
  } as Pick<EditorView, "dispatch" | "focus" | "updateState"> & {
    state: EditorState;
    isDestroyed: boolean;
    focus: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
  };

  const editor = {
    get state() {
      return state;
    },
    view,
  } as unknown as Editor;

  return { editor, view };
}

interface FormattingToolbarEditorOverrides {
  dragging?: FormattingToolbarEditor["view"]["dragging"];
  isActive?: FormattingToolbarEditor["isActive"];
}

export function createFormattingToolbarEditor(
  state: EditorState,
  overrides: FormattingToolbarEditorOverrides = {},
): FormattingToolbarEditor {
  return {
    state,
    view: { dragging: overrides.dragging ?? null },
    isActive: overrides.isActive ?? (() => false),
  } as FormattingToolbarEditor;
}
