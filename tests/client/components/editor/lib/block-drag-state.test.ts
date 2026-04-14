import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState, NodeSelection, type Transaction } from "@tiptap/pm/state";
import { primeTopLevelBlockDragState } from "@/client/components/editor/lib/block-drag-state";
import { createHeadingNode, createParagraphNode } from "@tests/client/util/editor-fixtures";

const schema = getSchema([StarterKit.configure({ undoRedo: false })]);

describe("block drag state priming", () => {
  it("primes an empty top-level paragraph for internal drag/drop", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        createHeadingNode("Sup Bro"),
        createParagraphNode("Test"),
        { type: "paragraph" },
        createParagraphNode("Mentions"),
      ],
    });
    const state = EditorState.create({ schema, doc });
    const emptyPos = doc.child(0)!.nodeSize + doc.child(1)!.nodeSize;
    const dispatches: EditorState[] = [];
    const view: Parameters<typeof primeTopLevelBlockDragState>[0] = {
      state,
      dragging: null,
      dispatch(tr: Transaction) {
        this.state = this.state.apply(tr);
        dispatches.push(this.state);
      },
    };

    expect(primeTopLevelBlockDragState(view, emptyPos)).toBe(true);
    expect(dispatches).toHaveLength(1);
    expect(view.dragging?.move).toBe(true);
    expect(view.dragging?.slice.content.toJSON()).toEqual([{ type: "paragraph" }]);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).from).toBe(emptyPos);
  });

  it("ignores invalid block positions", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createParagraphNode("Test")],
    });
    const state = EditorState.create({ schema, doc });
    const view: Parameters<typeof primeTopLevelBlockDragState>[0] = {
      state,
      dragging: null,
      dispatch() {
        throw new Error("should not dispatch");
      },
    };

    expect(primeTopLevelBlockDragState(view, 999)).toBe(false);
    expect(view.dragging).toBeNull();
  });
});
