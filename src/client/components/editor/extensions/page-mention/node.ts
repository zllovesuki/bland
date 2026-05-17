import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment, Slice, type Node as PmNode } from "@tiptap/pm/model";
import { SharedPageMentionNode } from "@/shared/editor/schema";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import { PageMentionView } from "./node-view";

interface PageMentionNodeOptions {
  getAffordance: () => EditorAffordance | null;
}

export const PageMentionNode = SharedPageMentionNode.extend<PageMentionNodeOptions>({
  addOptions() {
    return {
      getAffordance: () => null,
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
