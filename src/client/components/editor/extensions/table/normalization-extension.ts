import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { applyExplicitColumnWidths, deriveCanonicalColumnWidths, snapshotTableWidths } from "./widths";

export const TableWidthNormalization = Extension.create({
  name: "tableWidthNormalization",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          let nextTr = newState.tr;
          let mutated = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.spec.tableRole !== "table") return true;

            const snap = snapshotTableWidths(node);
            if (!snap.hasSome || snap.hasAll) return false;

            const widths = deriveCanonicalColumnWidths(newState.doc, node, pos);
            if (!widths) return false;

            mutated = applyExplicitColumnWidths(newState, nextTr, pos, widths) || mutated;
            return false;
          });

          if (!mutated) return null;
          nextTr.setMeta("addToHistory", false);
          return nextTr;
        },
      }),
    ];
  },
});
