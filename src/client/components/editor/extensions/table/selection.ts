import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { Node as PMNode } from "@tiptap/pm/model";

export function columnCellSelection(
  doc: PMNode,
  tablePos: number,
  table: PMNode,
  colIndex: number,
): CellSelection | null {
  const map = TableMap.get(table);
  if (colIndex < 0 || colIndex >= map.width) return null;

  const start = tablePos + 1;
  const firstCellPos = map.positionAt(0, colIndex, table);
  const lastCellPos = map.positionAt(map.height - 1, colIndex, table);
  return CellSelection.colSelection(doc.resolve(start + firstCellPos), doc.resolve(start + lastCellPos));
}

export function rowCellSelection(doc: PMNode, tablePos: number, table: PMNode, rowIndex: number): CellSelection | null {
  const map = TableMap.get(table);
  if (rowIndex < 0 || rowIndex >= map.height) return null;

  const start = tablePos + 1;
  const firstCellPos = map.positionAt(rowIndex, 0, table);
  const lastCellPos = map.positionAt(rowIndex, map.width - 1, table);
  return CellSelection.rowSelection(doc.resolve(start + firstCellPos), doc.resolve(start + lastCellPos));
}

export function setCaretInCell(view: EditorView, table: PMNode, tablePos: number, row: number, col: number) {
  const map = TableMap.get(table);
  if (row < 0 || row >= map.height || col < 0 || col >= map.width) return;

  const start = tablePos + 1;
  const cellOffset = map.positionAt(row, col, table);
  const inside = start + cellOffset + 1;
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(inside))));
}
