import { Extension } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";

export const TABLE_CELL_MIN_WIDTH = 80;

function parseHeightStyle(style: string): number | null {
  const match = /(?:^|;)\s*height\s*:\s*([0-9.]+)px\s*(?:;|$)/i.exec(style);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const SharedTable = Table.configure({
  resizable: true,
  allowTableNodeSelection: true,
  cellMinWidth: TABLE_CELL_MIN_WIDTH,
  lastColumnResizable: true,
  renderWrapper: true,
  View: null,
});

export const SharedTableRow = TableRow;
export const SharedTableCell = TableCell;
export const SharedTableHeader = TableHeader;

export const SharedTableRowHeightAttribute = Extension.create({
  name: "tableRowHeight",

  addGlobalAttributes() {
    return [
      {
        types: ["tableRow"],
        attributes: {
          height: {
            default: null,
            parseHTML: (element) => parseHeightStyle(element.getAttribute("style") ?? ""),
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

export function createSharedTableExtensions() {
  return [SharedTable, SharedTableRow, SharedTableCell, SharedTableHeader, SharedTableRowHeightAttribute] as const;
}
