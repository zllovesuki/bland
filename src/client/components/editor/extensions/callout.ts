import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CalloutView } from "./callout-view";

export const CALLOUT_KINDS = ["info", "tip", "warning"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];
export const DEFAULT_CALLOUT_KIND: CalloutKind = "info";

const CALLOUT_KIND_SET: ReadonlySet<string> = new Set(CALLOUT_KINDS);

export function isCalloutKind(value: unknown): value is CalloutKind {
  return typeof value === "string" && CALLOUT_KIND_SET.has(value);
}

export function normalizeCalloutKind(value: unknown): CalloutKind {
  return isCalloutKind(value) ? value : DEFAULT_CALLOUT_KIND;
}

export const CalloutExtension = Node.create({
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

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
