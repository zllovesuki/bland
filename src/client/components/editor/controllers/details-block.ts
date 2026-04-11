import type { Editor, JSONContent, Range } from "@tiptap/core";

export const DEFAULT_DETAILS_SUMMARY = "Details";

export interface DetailsBlockAttrs {
  summary?: string;
  open?: boolean;
}

export function createDetailsBlockNode(attrs: DetailsBlockAttrs = {}): JSONContent {
  return {
    type: "details",
    attrs: {
      open: attrs.open ?? true,
    },
    content: [
      {
        type: "detailsSummary",
        content: [
          {
            type: "text",
            text: attrs.summary?.trim() || DEFAULT_DETAILS_SUMMARY,
          },
        ],
      },
      {
        type: "detailsContent",
        content: [
          {
            type: "paragraph",
          },
        ],
      },
    ],
  };
}

export function insertDetailsBlock(editor: Editor, range: Range, attrs: DetailsBlockAttrs = {}) {
  const summary = attrs.summary?.trim() || DEFAULT_DETAILS_SUMMARY;
  const summaryStart = range.from + 2;

  editor
    .chain()
    .focus(null, { scrollIntoView: false })
    .deleteRange(range)
    .insertContent(createDetailsBlockNode(attrs))
    .setTextSelection({ from: summaryStart, to: summaryStart + summary.length })
    .run();
}
