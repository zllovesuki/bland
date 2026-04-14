import { describe, expect, it } from "vitest";
import { TextSelection, NodeSelection } from "@tiptap/pm/state";
import { schema } from "prosemirror-schema-basic";
import { getMovedTextblockCursorPos } from "@/client/components/editor/lib/moved-textblock-selection";

describe("post-drop selection", () => {
  it("returns a caret position inside dropped textblocks", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("hello")])]);

    const selection = NodeSelection.create(doc, 0);

    expect(getMovedTextblockCursorPos(selection)).toBe(selection.to - 1);
  });

  it("returns the only valid cursor position for empty paragraphs", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph")]);

    const selection = NodeSelection.create(doc, 0);

    expect(getMovedTextblockCursorPos(selection)).toBe(selection.from + 1);
  });

  it("ignores non-textblock node selections", () => {
    const doc = schema.node("doc", null, [
      schema.node("blockquote", null, [schema.node("paragraph", null, [schema.text("hello")])]),
    ]);

    const selection = NodeSelection.create(doc, 0);

    expect(getMovedTextblockCursorPos(selection)).toBeNull();
  });

  it("ignores non-node selections", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("hello")])]);

    const selection = TextSelection.create(doc, 1);

    expect(getMovedTextblockCursorPos(selection)).toBeNull();
  });
});
