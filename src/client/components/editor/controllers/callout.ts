import type { Editor, JSONContent, Range } from "@tiptap/core";
import { DEFAULT_CALLOUT_KIND, normalizeCalloutKind, type CalloutKind } from "../extensions/callout";

export interface CalloutBlockAttrs {
  kind?: CalloutKind;
}

export function createCalloutNode(attrs: CalloutBlockAttrs = {}): JSONContent {
  const kind = attrs.kind ? normalizeCalloutKind(attrs.kind) : DEFAULT_CALLOUT_KIND;
  return {
    type: "callout",
    attrs: { kind },
    content: [{ type: "paragraph" }],
  };
}

export function insertCalloutBlock(editor: Editor, range: Range, attrs: CalloutBlockAttrs = {}): boolean {
  // After deleteRange + insertContent(callout > paragraph), positioning the
  // caret at range.from + 2 lands inside the first empty paragraph (one
  // step past the callout opening, one past the paragraph opening).
  const caret = range.from + 2;
  return editor
    .chain()
    .focus(null, { scrollIntoView: false })
    .deleteRange(range)
    .insertContent(createCalloutNode(attrs))
    .setTextSelection(caret)
    .run();
}
