import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { TOP_LEVEL_MOVABLE_NODE_TYPES, generateBlockBid, getTopLevelBlocks } from "../lib/top-level-blocks";

const topLevelBlockIdentityKey = new PluginKey("topLevelBlockIdentity");
const TOP_LEVEL_DOC_ID_META = "topLevelBlockIdentity";

export function applyTopLevelBlockIdNormalization(tr: Parameters<EditorView["dispatch"]>[0]): boolean {
  const seen = new Set<string>();
  let mutated = false;

  const topLevelBlocks = getTopLevelBlocks(tr.doc);
  for (const block of topLevelBlocks) {
    let nextBid = block.bid;
    if (!nextBid || seen.has(nextBid)) {
      do {
        nextBid = generateBlockBid();
      } while (seen.has(nextBid));

      tr.setNodeMarkup(block.pos, undefined, {
        ...block.node.attrs,
        bid: nextBid,
      });
      mutated = true;
    }
    seen.add(nextBid);
  }

  tr.doc.descendants((node, pos, parent) => {
    if (pos < 0 || parent?.type.name === "doc") return true;
    if (typeof node.attrs.bid === "undefined" || node.attrs.bid == null) return true;

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      bid: null,
    });
    mutated = true;
    return true;
  });

  return mutated;
}

function dispatchInitialNormalization(view: EditorView) {
  queueMicrotask(() => {
    if (view.isDestroyed) return;
    const tr = view.state.tr;
    if (!applyTopLevelBlockIdNormalization(tr)) return;
    tr.setMeta(topLevelBlockIdentityKey, true);
    tr.setMeta(TOP_LEVEL_DOC_ID_META, true);
    tr.setMeta("addToHistory", false);
    view.dispatch(tr);
  });
}

export const TopLevelBlockIdentity = Extension.create({
  name: "topLevelBlockIdentity",

  addGlobalAttributes() {
    return [
      {
        types: [...TOP_LEVEL_MOVABLE_NODE_TYPES],
        attributes: {
          bid: {
            default: null,
            parseHTML: (element) => {
              const raw = (element as HTMLElement).getAttribute("data-bid");
              return raw && raw.length > 0 ? raw : null;
            },
            renderHTML: (attributes: { bid?: string | null }) => {
              if (!attributes.bid) return {};
              return { "data-bid": attributes.bid };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: topLevelBlockIdentityKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (transactions.some((tr) => tr.getMeta(topLevelBlockIdentityKey) || tr.getMeta(TOP_LEVEL_DOC_ID_META))) {
            return null;
          }

          const tr = newState.tr;
          if (!applyTopLevelBlockIdNormalization(tr)) return null;
          tr.setMeta(topLevelBlockIdentityKey, true);
          tr.setMeta(TOP_LEVEL_DOC_ID_META, true);
          tr.setMeta("addToHistory", false);
          return tr;
        },
        view(view) {
          dispatchInitialNormalization(view);
          return {};
        },
      }),
    ];
  },
});
