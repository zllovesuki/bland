import type { EditorView } from "@tiptap/pm/view";
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

export function findLogicalCellElement(
  rows: HTMLTableRowElement[],
  rowIndex: number,
  colIndex: number,
): HTMLTableCellElement | null {
  const row = rows[rowIndex];
  if (!row) return null;

  let logicalCol = 0;
  const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));
  for (const cell of cells) {
    const colspanAttr = cell.getAttribute("colspan");
    const colspan = colspanAttr ? Math.max(1, parseInt(colspanAttr, 10)) : 1;
    if (colIndex >= logicalCol && colIndex < logicalCol + colspan) return cell;
    logicalCol += colspan;
  }

  return null;
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
