import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type Selection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { allCellsSelection } from "./table/selection";

type SelectStep = { kind: "text"; from: number; to: number } | { kind: "cells"; tablePos: number; table: PMNode };

// Order matters only conceptually — the walk visits $from.depth inward-to-outward,
// so the innermost container (e.g. paragraph) naturally becomes the first rung
// and parents follow. Including leaf text-blocks like paragraph / heading keeps
// the first Ctrl+A press inside a single block's text, which in turn avoids
// backspace crossing a block boundary and violating a parent's `block+` schema
// (e.g. detailsContent) — the common case that would otherwise eject the cursor
// out of the details block.
const CONTAINER_TEXT_TYPES = new Set([
  "paragraph",
  "heading",
  "codeBlock",
  "detailsSummary",
  "detailsContent",
  "details",
  "callout",
  "tableCell",
  "tableHeader",
  "taskItem",
  "listItem",
  "taskList",
  "bulletList",
  "orderedList",
  "blockquote",
]);

function buildSteps(selection: Selection, doc: PMNode): SelectStep[] {
  const { $from } = selection;
  const steps: SelectStep[] = [];

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const name = node.type.name;

    if (name === "table") {
      steps.push({ kind: "cells", tablePos: $from.before(depth), table: node });
      continue;
    }

    if (CONTAINER_TEXT_TYPES.has(name)) {
      steps.push({ kind: "text", from: $from.start(depth), to: $from.end(depth) });
    }
  }

  steps.push({ kind: "text", from: 0, to: doc.content.size });
  return steps;
}

function stepMatchesSelection(selection: Selection, step: SelectStep): boolean {
  if (step.kind === "text") {
    return selection instanceof TextSelection && selection.from === step.from && selection.to === step.to;
  }
  if (!(selection instanceof CellSelection)) return false;
  const map = TableMap.get(step.table);
  const start = step.tablePos + 1;
  const first = start + map.positionAt(0, 0, step.table);
  const last = start + map.positionAt(map.height - 1, map.width - 1, step.table);
  const anchor = selection.$anchorCell.pos;
  const head = selection.$headCell.pos;
  return (anchor === first && head === last) || (anchor === last && head === first);
}

export const ContextAwareSelectAll = Extension.create({
  name: "contextAwareSelectAll",

  addKeyboardShortcuts() {
    return {
      "Mod-a": () => {
        const { state, view } = this.editor;
        const steps = buildSteps(state.selection, state.doc);
        for (const step of steps) {
          if (stepMatchesSelection(state.selection, step)) continue;
          if (step.kind === "text") {
            const nextSelection = TextSelection.create(state.doc, step.from, step.to);
            view.dispatch(state.tr.setSelection(nextSelection));
            return true;
          }
          const nextSelection = allCellsSelection(state.doc, step.tablePos, step.table);
          if (!nextSelection) continue;
          view.dispatch(state.tr.setSelection(nextSelection));
          return true;
        }
        return false;
      },
    };
  },
});
