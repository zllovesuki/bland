import type { Editor, JSONContent, Range } from "@tiptap/core";
import { TextSelection, type Transaction } from "@tiptap/pm/state";

export const DEFAULT_DETAILS_SUMMARY = "Details";
export const DETAILS_SUMMARY_PLACEHOLDER = "Summary";

export interface DetailsBlockAttrs {
  summary?: string;
  open?: boolean;
}

export function createDetailsBlockNode(attrs: DetailsBlockAttrs = {}): JSONContent {
  const summary = attrs.summary?.trim();

  return {
    type: "details",
    attrs: {
      open: attrs.open ?? true,
    },
    content: [
      {
        type: "detailsSummary",
        content: summary
          ? [
              {
                type: "text",
                text: summary,
              },
            ]
          : undefined,
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
  const summary = attrs.summary?.trim() ?? "";
  const summaryStart = range.from + 2;

  const inserted = editor
    .chain()
    .focus(null, { scrollIntoView: false })
    .deleteRange(range)
    .insertContent(createDetailsBlockNode(attrs))
    .setTextSelection({ from: summaryStart, to: summaryStart + summary.length })
    .run();

  if (!inserted) return;

  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;

    if (!summary) {
      focusEmptyDetailsSummary(editor);
      return;
    }

    editor
      .chain()
      .focus(null, { scrollIntoView: false })
      .setTextSelection({ from: summaryStart, to: summaryStart + summary.length })
      .run();
  });
}

function focusEmptyDetailsSummary(editor: Editor) {
  const { selection } = editor.state;
  const { $from } = selection;

  let detailsDepth = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "details") {
      detailsDepth = depth;
      break;
    }
  }

  if (detailsDepth < 0) return;

  const detailsPos = $from.before(detailsDepth);
  const summaryPos = detailsPos + 2;
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, summaryPos));
  editor.view.dispatch(tr);
  editor.view.focus();
}

export function applyMoveToDetailsContent(tr: Transaction): boolean {
  const { selection } = tr;
  const { schema } = tr.doc.type;
  const { empty, $from } = selection;

  if (!empty || $from.parent.type !== schema.nodes.detailsSummary) {
    return false;
  }

  let detailsDepth = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === schema.nodes.details) {
      detailsDepth = depth;
      break;
    }
  }

  if (detailsDepth < 0) {
    return false;
  }

  const detailsPos = $from.before(detailsDepth);
  const detailsNode = $from.node(detailsDepth);
  const detailsSummary = detailsNode.firstChild;
  const detailsContent = detailsNode.childCount > 1 ? detailsNode.child(1) : null;

  if (!detailsSummary || !detailsContent || detailsContent.type !== schema.nodes.detailsContent) {
    return false;
  }

  if (detailsNode.attrs.open === false) {
    tr.setNodeMarkup(detailsPos, undefined, {
      ...detailsNode.attrs,
      open: true,
    });
  }

  const contentPos = detailsPos + 1 + detailsSummary.nodeSize;
  tr.setSelection(TextSelection.near(tr.doc.resolve(contentPos + 1)));
  return true;
}
