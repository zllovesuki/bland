import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  applyMoveToDetailsContent,
  createDetailsBlockNode,
  DEFAULT_DETAILS_SUMMARY,
  DETAILS_SUMMARY_PLACEHOLDER,
} from "@/client/components/editor/controllers/details-block";
import { DetailsBlockExtensions } from "@/client/components/editor/extensions/details-block";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), ...DetailsBlockExtensions]);

describe("details block helpers", () => {
  it("leaves the summary empty by default so the placeholder can guide the title field", () => {
    expect(createDetailsBlockNode()).toEqual({
      type: "details",
      attrs: { open: true },
      content: [
        {
          type: "detailsSummary",
        },
        {
          type: "detailsContent",
          content: [{ type: "paragraph" }],
        },
      ],
    });
  });

  it("still preserves an explicit summary when one is provided", () => {
    expect(createDetailsBlockNode({ summary: "Specs" })).toEqual({
      type: "details",
      attrs: { open: true },
      content: [
        {
          type: "detailsSummary",
          content: [{ type: "text", text: "Specs" }],
        },
        {
          type: "detailsContent",
          content: [{ type: "paragraph" }],
        },
      ],
    });
  });

  it("keeps the human-readable fallback label and a separate summary placeholder", () => {
    expect(DEFAULT_DETAILS_SUMMARY).toBe("Details");
    expect(DETAILS_SUMMARY_PLACEHOLDER).toBe("Summary");
  });

  it("moves an empty summary selection into the details content", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createDetailsBlockNode()],
    });
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 2),
    });
    const tr = state.tr;

    expect(applyMoveToDetailsContent(tr)).toBe(true);
    expect(tr.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("opens a closed details block before moving into its content", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createDetailsBlockNode({ open: false })],
    });
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 2),
    });
    const tr = state.tr;

    expect(applyMoveToDetailsContent(tr)).toBe(true);
    expect(tr.doc.firstChild?.attrs.open).toBe(true);
    expect(tr.selection.$from.parent.type.name).toBe("paragraph");
  });
});
