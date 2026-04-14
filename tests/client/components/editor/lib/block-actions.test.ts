import { afterEach, describe, expect, it, vi } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { StarterKit } from "@tiptap/starter-kit";
import {
  applyDeleteTopLevelBlock,
  applyMoveTopLevelBlock,
  canMoveTopLevelBlock,
  moveTopLevelBlock,
} from "@/client/components/editor/lib/block-actions";
import { DetailsBlockExtensions } from "@/client/components/editor/extensions/details-block";
import { TopLevelBlockIdentity } from "@/client/components/editor/extensions/top-level-block-identity";
import { createDetailsNode, createParagraphNode } from "@tests/client/util/editor-fixtures";
import { createDispatchingTestEditor } from "@tests/client/util/editor-mocks";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), ...DetailsBlockExtensions, TopLevelBlockIdentity]);

describe("block action helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves a details block upward as a single top-level block", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        createParagraphNode("Intro", "intro"),
        createDetailsNode({ bid: "details", summary: "Specs" }),
        createParagraphNode("Outro", "outro"),
      ],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyMoveTopLevelBlock(tr, "details", -1)).toBe(true);
    expect(tr.doc.toJSON()).toEqual({
      type: "doc",
      content: [
        createDetailsNode({ bid: "details", summary: "Specs" }),
        createParagraphNode("Intro", "intro"),
        createParagraphNode("Outro", "outro"),
      ],
    });
    expect(tr.selection).toBeInstanceOf(NodeSelection);
    expect((tr.selection as NodeSelection).from).toBe(0);
  });

  it("moves a code block without changing its language or bid", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        createParagraphNode("Intro", "intro"),
        {
          type: "codeBlock",
          attrs: { bid: "code", language: "typescript" },
          content: [{ type: "text", text: "const count = 1" }],
        },
      ],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyMoveTopLevelBlock(tr, "code", -1)).toBe(true);
    expect(tr.doc.toJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { bid: "code", language: "typescript" },
          content: [{ type: "text", text: "const count = 1" }],
        },
        createParagraphNode("Intro", "intro"),
      ],
    });
    expect(tr.selection).toBeInstanceOf(NodeSelection);
  });

  it("replaces the final block with an empty paragraph when deleting it", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createDetailsNode({ bid: "details" })],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyDeleteTopLevelBlock(tr, "details")).toBe(true);
    expect(tr.doc.toJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph", attrs: { bid: null } }],
    });
    expect(tr.selection.from).toBe(1);
  });

  it("reports move availability from the live top-level block order", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        createParagraphNode("First", "first"),
        createDetailsNode({ bid: "details" }),
        createParagraphNode("Last", "last"),
      ],
    });

    expect(canMoveTopLevelBlock(doc, "first", -1)).toBe(false);
    expect(canMoveTopLevelBlock(doc, "details", -1)).toBe(true);
    expect(canMoveTopLevelBlock(doc, "details", 1)).toBe(true);
    expect(canMoveTopLevelBlock(doc, "last", 1)).toBe(false);
  });

  it("collapses moved code blocks to a text selection after dispatch", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        createParagraphNode("Intro", "intro"),
        {
          type: "codeBlock",
          attrs: { bid: "code", language: "typescript" },
          content: [{ type: "text", text: "const count = 1" }],
        },
      ],
    });
    const { editor, view } = createDispatchingTestEditor(schema, doc);

    expect(moveTopLevelBlock(editor, "code", -1)).toBe(true);
    expect(view.state.doc.toJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { bid: "code", language: "typescript" },
          content: [{ type: "text", text: "const count = 1" }],
        },
        createParagraphNode("Intro", "intro"),
      ],
    });
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$head.parent.type.name).toBe("codeBlock");
    expect(view.focus).toHaveBeenCalledTimes(1);
    expect(view.updateState).toHaveBeenCalledTimes(1);
  });

  it("keeps moved non-textblocks as node selections after dispatch", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createParagraphNode("Intro", "intro"), createDetailsNode({ bid: "details", summary: "Specs" })],
    });
    const { editor, view } = createDispatchingTestEditor(schema, doc);

    expect(moveTopLevelBlock(editor, "details", -1)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.$head.parent.type.name).toBe("doc");
    expect(view.focus).toHaveBeenCalledTimes(1);
    expect(view.updateState).toHaveBeenCalledTimes(1);
  });
});
