import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment, Slice, type Node as PmNode } from "@tiptap/pm/model";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import { PageMentionView } from "./node-view";
import "./commands";

interface PageMentionNodeOptions {
  getAffordance: () => EditorAffordance | null;
}

export const PageMentionNode = Node.create<PageMentionNodeOptions>({
  name: "pageMention",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      getAffordance: () => null,
    };
  },

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

  addProseMirrorPlugins() {
    const getAffordance = this.options.getAffordance;
    return [
      new Plugin({
        key: new PluginKey("pageMentionPasteGuard"),
        props: {
          // Persisted documents still need to parse and render mentions, so we
          // keep `parseHTML` permissive. The clipboard ingress is closed here:
          // when the live affordance denies mention insertion (shared surface,
          // read-only, or missing workspace context), strip pageMention nodes
          // from the pasted slice before they enter the doc/Yjs.
          transformPasted(slice) {
            const affordance = getAffordance();
            if (!affordance || affordance.canInsertPageMentions) return slice;
            return stripPageMentions(slice);
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageMentionView);
  },
});

export function stripPageMentions(slice: Slice): Slice {
  const stripped = stripFragment(slice.content);
  if (stripped === slice.content) return slice;
  return new Slice(stripped, slice.openStart, slice.openEnd);
}

function stripFragment(fragment: Fragment): Fragment {
  const kept: PmNode[] = [];
  let changed = false;
  fragment.forEach((node) => {
    if (node.type.name === "pageMention") {
      changed = true;
      return;
    }
    if (node.content.size === 0) {
      kept.push(node);
      return;
    }
    const innerStripped = stripFragment(node.content);
    if (innerStripped === node.content) {
      kept.push(node);
    } else {
      changed = true;
      kept.push(node.copy(innerStripped));
    }
  });
  return changed ? Fragment.fromArray(kept) : fragment;
}
