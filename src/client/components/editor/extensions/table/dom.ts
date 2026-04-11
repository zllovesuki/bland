import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface ColumnEntry {
  domCell: HTMLTableCellElement;
  logicalCol: number;
  colspan: number;
}

export interface LocalRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function findTableForWrapper(view: EditorView, wrapper: HTMLElement): { pos: number; node: PMNode } | null {
  let found: { pos: number; node: PMNode } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.spec.tableRole !== "table") return true;
    if (view.nodeDOM(pos) === wrapper) {
      found = { pos, node };
    }
    return false;
  });
  return found;
}

export function findTableElement(view: EditorView, tablePos: number): HTMLTableElement | null {
  try {
    const domAt = view.domAtPos(tablePos + 1);
    let node: Node | null = domAt.node;
    while (node) {
      if (node instanceof HTMLTableElement) return node;
      node = node.parentNode;
    }
  } catch {
    return null;
  }
  return null;
}

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

export function setCaretInCell(view: EditorView, table: PMNode, tablePos: number, row: number, col: number) {
  const map = TableMap.get(table);
  if (row < 0 || row >= map.height || col < 0 || col >= map.width) return;

  const start = tablePos + 1;
  const cellOffset = map.positionAt(row, col, table);
  const inside = start + cellOffset + 1;
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(inside))));
}

export function buildColumnEntries(firstRow: HTMLTableRowElement): ColumnEntry[] {
  const entries: ColumnEntry[] = [];
  let logicalCol = 0;

  const cells = Array.from(firstRow.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));
  for (const cell of cells) {
    const colspanAttr = cell.getAttribute("colspan");
    const colspan = colspanAttr ? Math.max(1, parseInt(colspanAttr, 10)) : 1;
    entries.push({ domCell: cell, logicalCol, colspan });
    logicalCol += colspan;
  }

  return entries;
}

export function rowDropIndex(rows: HTMLTableRowElement[], y: number): number {
  if (rows.length === 0) return 0;
  for (let index = 0; index < rows.length; index++) {
    const rect = rows[index].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return index;
  }
  return rows.length;
}

export function columnDropIndex(entries: ColumnEntry[], totalCols: number, x: number): number {
  if (entries.length === 0) return 0;
  for (const entry of entries) {
    const rect = entry.domCell.getBoundingClientRect();
    if (x < rect.left + rect.width / 2) return entry.logicalCol;
  }
  return totalCols;
}

export function createLocalRectConverter(host: HTMLElement): (rect: DOMRect) => LocalRect {
  const rootRect = host.getBoundingClientRect();
  const rootScrollTop = host.scrollTop;
  const rootScrollLeft = host.scrollLeft;

  return (rect: DOMRect) => ({
    top: rect.top - rootRect.top + rootScrollTop,
    left: rect.left - rootRect.left + rootScrollLeft,
    right: rect.right - rootRect.left + rootScrollLeft,
    bottom: rect.bottom - rootRect.top + rootScrollTop,
    width: rect.width,
    height: rect.height,
  });
}
