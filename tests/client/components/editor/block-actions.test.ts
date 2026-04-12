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

const schema = getSchema([StarterKit.configure({ undoRedo: false }), ...DetailsBlockExtensions]);

describe("block action helpers", () => {
  it("moves a details block upward as a single top-level block", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [paragraph("Intro"), createDetailsBlockNode({ summary: "Specs" }), paragraph("Outro")],
    });
    const detailsPos = doc.child(0)?.nodeSize ?? 0;
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyMoveTopLevelBlock(tr, detailsPos, -1)).toBe(true);
    expect(tr.doc.toJSON()).toEqual({
      type: "doc",
      content: [createDetailsBlockNode({ summary: "Specs" }), paragraph("Intro"), paragraph("Outro")],
    });
    expect(tr.selection).toBeInstanceOf(NodeSelection);
    expect((tr.selection as NodeSelection).from).toBe(0);
  });

  it("replaces the final block with an empty paragraph when deleting it", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createDetailsBlockNode()],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyDeleteTopLevelBlock(tr, 0)).toBe(true);
    expect(tr.doc.toJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(tr.selection.from).toBe(1);
  });

  it("reports move availability from the live top-level block order", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [paragraph("First"), createDetailsBlockNode(), paragraph("Last")],
    });
    const detailsPos = doc.child(0)?.nodeSize ?? 0;

    expect(canMoveTopLevelBlock(doc, 0, -1)).toBe(false);
    expect(canMoveTopLevelBlock(doc, detailsPos, -1)).toBe(true);
    expect(canMoveTopLevelBlock(doc, detailsPos, 1)).toBe(true);
    expect(canMoveTopLevelBlock(doc, detailsPos + doc.child(1)!.nodeSize, 1)).toBe(false);
  });
});

function paragraph(text: string) {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}
