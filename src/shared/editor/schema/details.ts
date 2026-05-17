import { mergeAttributes, Node } from "@tiptap/core";

export const DEFAULT_DETAILS_SUMMARY = "Details";
export const DETAILS_SUMMARY_PLACEHOLDER = "Summary";

export const SharedDetailsBlock = Node.create({
  name: "details",
  content: "detailsSummary detailsContent",
  group: "block",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute("open"),
        renderHTML: ({ open }) => {
          if (!open) return {};
          return { open: "" };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "details" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes({ class: "tiptap-details" }, HTMLAttributes), 0];
  },
});

export const SharedDetailsBlockSummary = Node.create({
  name: "detailsSummary",
  content: "text*",
  defining: true,
  selectable: false,
  isolating: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "summary",
      mergeAttributes(
        {
          class: "tiptap-details-summary",
          "data-placeholder": DETAILS_SUMMARY_PLACEHOLDER,
        },
        HTMLAttributes,
      ),
      0,
    ];
  },
});

export const SharedDetailsBlockContent = Node.create({
  name: "detailsContent",
  content: "block+",
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="detailsContent"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        {
          class: "tiptap-details-content",
          "data-type": "detailsContent",
        },
        HTMLAttributes,
      ),
      0,
    ];
  },
});

export const SharedDetailsBlockExtensions = [
  SharedDetailsBlock,
  SharedDetailsBlockSummary,
  SharedDetailsBlockContent,
] as const;
