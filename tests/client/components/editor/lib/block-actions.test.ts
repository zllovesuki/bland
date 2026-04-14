import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import {
  applyDeleteTopLevelBlock,
  applyMoveTopLevelBlock,
  canMoveTopLevelBlock,
} from "@/client/components/editor/lib/block-actions";
import { createDetailsBlockNode } from "@/client/components/editor/controllers/details-block";
import { DetailsBlockExtensions } from "@/client/components/editor/extensions/details-block";
import { TopLevelBlockIdentity } from "@/client/components/editor/extensions/top-level-block-identity";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), ...DetailsBlockExtensions, TopLevelBlockIdentity]);

describe("block action helpers", () => {
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
