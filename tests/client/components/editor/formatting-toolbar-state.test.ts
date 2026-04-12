import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { FormattingToolbarEditor } from "@/client/components/editor/controllers/formatting-toolbar-state";
import { shouldShowFormattingToolbar } from "@/client/components/editor/controllers/formatting-toolbar-state";
import { createDetailsBlockNode } from "@/client/components/editor/controllers/details-block";
import { DetailsBlockExtensions } from "@/client/components/editor/extensions/details-block";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), ...DetailsBlockExtensions]);

describe("formatting toolbar visibility", () => {
  it("stays hidden when the selection is inside a details summary", () => {
    const summary = "Specs";
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createDetailsBlockNode({ summary })],
    });
    const from = 2;
    const to = from + summary.length;
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, from, to),
    });

    expect(shouldShowFormattingToolbar({ editor: createEditor(state), from, to })).toBe(false);
  });

  it("still shows for selections inside details content", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "details",
          attrs: { open: true },
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Specs" }],
            },
            {
              type: "detailsContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Body copy" }],
                },
              ],
            },
          ],
        },
      ],
    });
    const detailsNode = doc.firstChild;
    const summaryNode = detailsNode?.firstChild;

    expect(detailsNode).toBeTruthy();
    expect(summaryNode).toBeTruthy();

    const from = TextSelection.near(doc.resolve(1 + summaryNode!.nodeSize + 1)).from;
    const to = from + 4;
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, from, to),
    });

    expect(shouldShowFormattingToolbar({ editor: createEditor(state), from, to })).toBe(true);
  });
});

function createEditor(state: EditorState): FormattingToolbarEditor {
  return {
    state,
    view: { dragging: null },
    isActive: () => false,
  } as FormattingToolbarEditor;
}
