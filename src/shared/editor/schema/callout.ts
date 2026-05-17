import { mergeAttributes, Node } from "@tiptap/core";
import { DEFAULT_CALLOUT_KIND, normalizeCalloutKind } from "./callout-model";
export {
  CALLOUT_KINDS,
  DEFAULT_CALLOUT_KIND,
  isCalloutKind,
  normalizeCalloutKind,
  type CalloutKind,
} from "./callout-model";

export const SharedCalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      kind: {
        default: DEFAULT_CALLOUT_KIND,
        parseHTML: (element) => normalizeCalloutKind(element.getAttribute("data-callout-kind")),
        renderHTML: (attributes) => ({
          "data-callout-kind": normalizeCalloutKind(attributes.kind),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", class: "tiptap-callout" }), 0];
  },
});
