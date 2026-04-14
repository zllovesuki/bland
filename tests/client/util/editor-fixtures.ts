import type { JSONContent } from "@tiptap/core";
import { createDetailsBlockNode, type DetailsBlockAttrs } from "@/client/components/editor/controllers/details-block";

interface DetailsNodeOptions extends DetailsBlockAttrs {
  bid?: string | null;
  contentText?: string;
}

export function createParagraphNode(text: string, bid?: string | null): JSONContent {
  return {
    type: "paragraph",
    ...(typeof bid === "undefined" ? {} : { attrs: { bid } }),
    content: [{ type: "text", text }],
  };
}

export function createHeadingNode(text: string, level = 1): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

export function createDetailsNode(options: DetailsNodeOptions = {}): JSONContent {
  const { bid, contentText, ...attrs } = options;
  const node = createDetailsBlockNode(attrs);

  return {
    ...node,
    attrs:
      typeof bid === "undefined"
        ? node.attrs
        : {
            ...(node.attrs ?? {}),
            bid,
          },
    content: node.content?.map((child) => {
      if (child.type !== "detailsContent") {
        return child;
      }

      return {
        ...child,
        content: child.content?.map((contentChild) => {
          if (contentChild.type !== "paragraph") {
            return contentChild;
          }

          return {
            ...contentChild,
            ...(typeof bid === "undefined" ? {} : { attrs: { bid: null } }),
            ...(contentText ? { content: [{ type: "text", text: contentText }] } : {}),
          };
        }),
      };
    }),
  };
}
