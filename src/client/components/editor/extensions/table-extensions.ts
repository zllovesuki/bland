import type { AnyExtension } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow, TableView } from "@tiptap/extension-table";
import { TableMap } from "@tiptap/pm/tables";
import { TableHandles } from "./table/overlay-extension";
import { TableWidthNormalization } from "./table/normalization-extension";
import { TABLE_CELL_MIN_WIDTH } from "./table/constants";
import {
  applyExplicitColumnWidths,
  buildEvenWidths,
  clearExplicitColumnWidths,
  measureCanonicalTableWidth,
  measureAutoColumnWidths,
  measureRenderedTableWidth,
  measureWrapperContentWidth,
} from "./table/widths";

const CollaborationSafeTable = Table.extend({
  addNodeView() {
    const View = this.options.View;
    if (this.editor.isEditable || !View) return null;

    return ({ node, view }) => new View(node, this.options.cellMinWidth, view);
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableWidths: {
      /**
       * Clear explicit colwidth on every cell of the table at the given doc position.
       * After this runs the table returns to responsive layout (width: 100%).
       */
      resetTableColumnWidths: (tablePos: number) => ReturnType;
      /**
       * Persist explicit widths derived from rendered content, clamped to the
       * editor's minimum cell width.
       */
      fitTableColumnsToContent: (tablePos: number) => ReturnType;
      /**
       * Persist explicit widths that distribute the table's columns evenly
       * across the available wrapper width, clamped to the minimum cell width.
       */
      distributeTableColumnsEvenly: (tablePos: number) => ReturnType;
    };
  }
}

const TableRowHeightAttribute = Extension.create({
  name: "tableRowHeight",

  addGlobalAttributes() {
    return [
      {
        types: ["tableRow"],
        attributes: {
          height: {
            default: null,
            parseHTML: (element) => {
              const raw = (element as HTMLElement).style?.height ?? "";
              if (!raw.endsWith("px")) return null;
              const value = parseFloat(raw);
              return Number.isFinite(value) && value > 0 ? value : null;
            },
            renderHTML: (attributes: { height?: number | null }) => {
              if (!attributes.height) return {};
              return { style: `height: ${attributes.height}px` };
            },
          },
        },
      },
    ];
  },
});

const TableWidthCommands = Extension.create({
  name: "tableWidthCommands",

  addCommands() {
    return {
      resetTableColumnWidths:
        (tablePos: number) =>
        ({ state, tr, dispatch }) => {
          if (!clearExplicitColumnWidths(state, tr, tablePos)) return false;
          if (dispatch) dispatch(tr);
          return true;
        },
      fitTableColumnsToContent:
        (tablePos: number) =>
        ({ state, tr, dispatch }) => {
          const table = state.doc.nodeAt(tablePos);
          if (!table || table.type.spec.tableRole !== "table") return false;

          const widths = measureAutoColumnWidths(this.editor.view, tablePos);
          if (!widths) return false;
          if (!dispatch) return true;
          if (!applyExplicitColumnWidths(state, tr, tablePos, widths)) return false;
          dispatch(tr);
          return true;
        },
      distributeTableColumnsEvenly:
        (tablePos: number) =>
        ({ state, tr, dispatch }) => {
          const table = state.doc.nodeAt(tablePos);
          if (!table || table.type.spec.tableRole !== "table") return false;

          const totalWidth =
            measureWrapperContentWidth(this.editor.view, tablePos) ??
            measureCanonicalTableWidth(state.doc, table, tablePos) ??
            measureRenderedTableWidth(this.editor.view, tablePos);
          if (!totalWidth) return false;
          if (!dispatch) return true;

          const map = TableMap.get(table);
          const widths = buildEvenWidths(map.width, totalWidth);
          if (!applyExplicitColumnWidths(state, tr, tablePos, widths)) return false;
          dispatch(tr);
          return true;
        },
    };
  },
});

export function createTableExtensions(): AnyExtension[] {
  return [
    CollaborationSafeTable.configure({
      resizable: true,
      allowTableNodeSelection: true,
      cellMinWidth: TABLE_CELL_MIN_WIDTH,
      lastColumnResizable: true,
      renderWrapper: true,
      View: TableView,
    }),
    TableRow,
    TableCell,
    TableHeader,
    TableRowHeightAttribute,
    TableWidthCommands,
    TableWidthNormalization,
    TableHandles,
  ];
}
