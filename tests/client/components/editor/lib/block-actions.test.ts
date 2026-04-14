import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { StarterKit } from "@tiptap/starter-kit";
import {
  applyDeleteTopLevelBlock,
  applyMoveTopLevelBlock,
  canMoveTopLevelBlock,
  moveTopLevelBlock,
} from "@/client/components/editor/lib/block-actions";
import { createDetailsBlockNode } from "@/client/components/editor/controllers/details-block";
import { DetailsBlockExtensions } from "@/client/components/editor/extensions/details-block";
import { TopLevelBlockIdentity } from "@/client/components/editor/extensions/top-level-block-identity";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), ...DetailsBlockExtensions, TopLevelBlockIdentity]);

describe("block action helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves a details block upward as a single top-level block", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        paragraph("Intro", "intro"),
        createDetailsNode("details", { summary: "Specs" }),
        paragraph("Outro", "outro"),
      ],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyMoveTopLevelBlock(tr, "details", -1)).toBe(true);
    expect(tr.doc.toJSON()).toEqual({
      type: "doc",
      content: [
        createDetailsNode("details", { summary: "Specs" }),
        paragraph("Intro", "intro"),
        paragraph("Outro", "outro"),
      ],
    });
    expect(tr.selection).toBeInstanceOf(NodeSelection);
    expect((tr.selection as NodeSelection).from).toBe(0);
  });

  it("moves a code block without changing its language or bid", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        paragraph("Intro", "intro"),
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
        paragraph("Intro", "intro"),
      ],
    });
    expect(tr.selection).toBeInstanceOf(NodeSelection);
  });

  it("replaces the final block with an empty paragraph when deleting it", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createDetailsNode("details")],
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
      content: [paragraph("First", "first"), createDetailsNode("details"), paragraph("Last", "last")],
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
        paragraph("Intro", "intro"),
        {
          type: "codeBlock",
          attrs: { bid: "code", language: "typescript" },
          content: [{ type: "text", text: "const count = 1" }],
        },
      ],
    });
    const { editor, view } = createTestEditor(doc);

    expect(moveTopLevelBlock(editor, "code", -1)).toBe(true);
    expect(view.state.doc.toJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { bid: "code", language: "typescript" },
          content: [{ type: "text", text: "const count = 1" }],
        },
        paragraph("Intro", "intro"),
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
      content: [paragraph("Intro", "intro"), createDetailsNode("details", { summary: "Specs" })],
    });
    const { editor, view } = createTestEditor(doc);

    expect(moveTopLevelBlock(editor, "details", -1)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.$head.parent.type.name).toBe("doc");
    expect(view.focus).toHaveBeenCalledTimes(1);
    expect(view.updateState).toHaveBeenCalledTimes(1);
  });
});

function paragraph(text: string, bid: string) {
  return {
    type: "paragraph",
    attrs: { bid },
    content: [{ type: "text", text }],
  };
}

function createDetailsNode(bid: string, attrs?: Parameters<typeof createDetailsBlockNode>[0]) {
  const node = createDetailsBlockNode(attrs);
  return {
    ...node,
    attrs: {
      ...(node.attrs ?? {}),
      bid,
    },
    content: node.content?.map((child) =>
      child.type === "detailsContent"
        ? {
            ...child,
            content: child.content?.map((contentChild) =>
              contentChild.type === "paragraph"
                ? {
                    ...contentChild,
                    attrs: { bid: null },
                  }
                : contentChild,
            ),
          }
        : child,
    ),
  };
}

function createTestEditor(doc: PMNode) {
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
  } as Editor;

  return { editor, view };
}
