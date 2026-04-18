import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { PageMentionView } from "./node-view";
import "./commands";

export const PageMentionNode = Node.create({
  name: "pageMention",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      pageId: {
        default: null as string | null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-page-id"),
        renderHTML: (attrs) => {
          if (!attrs.pageId) return {};
          return { "data-page-id": attrs.pageId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-page-mention][data-page-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-page-mention": "" }), ""];
  },

  addCommands() {
    return {
      insertPageMention:
        ({ pageId, range }) =>
        ({ chain, editor }) => {
          if (!editor.isEditable || !pageId) return false;
          const c = chain().focus(null, { scrollIntoView: false });
          if (range) c.deleteRange(range);
          return c
            .insertContent([
              { type: "pageMention", attrs: { pageId } },
              { type: "text", text: " " },
            ])
            .run();
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageMentionView);
  },
});
