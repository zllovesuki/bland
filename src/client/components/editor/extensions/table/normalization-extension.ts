import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorState, PluginView } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { TableMap } from "@tiptap/pm/tables";
import { applyExplicitColumnWidths, readRenderedColumnPixelWidths, snapshotTableWidths } from "./widths";

class TableWidthNormalizationView implements PluginView {
  view: EditorView;
  normalizeRaf: number | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.maybeScheduleNormalization(view.state);
  }

  update(view: EditorView) {
    this.view = view;
    this.maybeScheduleNormalization(view.state);
  }

  destroy() {
    if (this.normalizeRaf !== null) cancelAnimationFrame(this.normalizeRaf);
    this.normalizeRaf = null;
  }

  private maybeScheduleNormalization(state: EditorState) {
    if (this.normalizeRaf !== null) return;

    let needsNormalization = false;
    state.doc.descendants((node) => {
      if (node.type.spec.tableRole !== "table") return true;
      const snap = snapshotTableWidths(node);
      if (snap.hasSome && !snap.hasAll) needsNormalization = true;
      return false;
    });

    if (!needsNormalization) return;
    this.normalizeRaf = requestAnimationFrame(() => {
      this.normalizeRaf = null;
      this.normalizeAllTables();
    });
  }

  private normalizeAllTables() {
    if (this.view.isDestroyed) return;

    const state = this.view.state;
    const targets: number[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.spec.tableRole !== "table") return true;
      const snap = snapshotTableWidths(node);
      if (snap.hasSome && !snap.hasAll) targets.push(pos);
      return false;
    });

    if (targets.length === 0) return;

    const tr = state.tr;
    let mutated = false;
    for (const tablePos of targets) {
      const table = state.doc.nodeAt(tablePos);
      if (!table || table.type.spec.tableRole !== "table") continue;

      const widths = readRenderedColumnPixelWidths(this.view, tablePos, TableMap.get(table).width);
      if (!widths) continue;
      mutated = applyExplicitColumnWidths(state, tr, tablePos, widths) || mutated;
    }

    if (!mutated) return;
    tr.setMeta("addToHistory", false);
    this.view.dispatch(tr);
  }
}

export const TableWidthNormalization = Extension.create({
  name: "tableWidthNormalization",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          return new TableWidthNormalizationView(editorView);
        },
      }),
    ];
  },
});
