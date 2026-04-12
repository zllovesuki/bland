import { TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TABLE_CELL_MIN_WIDTH } from "./constants";
import { findTableElement } from "./dom";

export interface TableWidthSnapshot {
  hasSome: boolean;
  hasAll: boolean;
}

export function hasExplicitColumnWidths(table: PMNode): boolean {
  let hasWidths = false;
  table.firstChild?.forEach((cell) => {
    if (cell.attrs.colwidth != null) hasWidths = true;
  });
  return hasWidths;
}

export function snapshotTableWidths(table: PMNode): TableWidthSnapshot {
  const map = TableMap.get(table);
  const coverage = new Array(map.width).fill(false);
  let hasSome = false;
  let col = 0;

  table.firstChild?.forEach((cell) => {
    const colspan = (cell.attrs.colspan as number) ?? 1;
    const colwidth = cell.attrs.colwidth as number[] | null;
    if (colwidth) {
      for (let index = 0; index < colspan; index++) {
        const width = colwidth[index];
        if (typeof width === "number" && width > 0) {
          coverage[col + index] = true;
          hasSome = true;
        }
      }
    }
    col += colspan;
  });

  return { hasSome, hasAll: coverage.every(Boolean) };
}

export function measureAutoColumnWidths(view: EditorView, tablePos: number): number[] | null {
  const tableEl = findTableElement(view, tablePos);
  if (!tableEl) return null;

  const host = document.createElement("div");
  host.className = "tiptap";
  host.style.position = "absolute";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.visibility = "hidden";
  host.style.pointerEvents = "none";
  host.style.width = "max-content";
  host.style.maxWidth = "none";
  host.style.whiteSpace = "nowrap";

  const clone = tableEl.cloneNode(true) as HTMLTableElement;
  clone.querySelector("colgroup")?.remove();
  clone.style.width = "max-content";
  clone.style.minWidth = "0";
  clone.style.maxWidth = "none";
  clone.style.tableLayout = "auto";
  clone.querySelectorAll<HTMLElement>("td, th").forEach((cell) => {
    cell.style.width = "auto";
    cell.style.minWidth = "0";
    cell.style.maxWidth = "none";
    cell.style.whiteSpace = "nowrap";
  });

  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const firstRow = clone.querySelector("tr");
    if (!(firstRow instanceof HTMLTableRowElement)) return null;

    const widths: number[] = [];
    for (const cell of Array.from(firstRow.cells)) {
      const colspan = Math.max(1, cell.colSpan || 1);
      const width = Math.max(TABLE_CELL_MIN_WIDTH, Math.ceil(cell.getBoundingClientRect().width / colspan));
      for (let index = 0; index < colspan; index++) widths.push(width);
    }

    return widths.length > 0 ? widths : null;
  } finally {
    host.remove();
  }
}

export function measureRenderedTableWidth(view: EditorView, tablePos: number): number | null {
  const tableEl = findTableElement(view, tablePos);
  if (!tableEl) return null;
  return Math.max(TABLE_CELL_MIN_WIDTH, Math.round(tableEl.getBoundingClientRect().width));
}

export function measureWrapperContentWidth(view: EditorView, tablePos: number): number | null {
  const tableEl = findTableElement(view, tablePos);
  const wrapper = tableEl?.closest(".tableWrapper");
  if (!(wrapper instanceof HTMLElement)) return null;

  const styles = getComputedStyle(wrapper);
  const paddingLeft = parseFloat(styles.paddingLeft) || 0;
  const paddingRight = parseFloat(styles.paddingRight) || 0;
  return Math.max(0, wrapper.clientWidth - paddingLeft - paddingRight - 1);
}

export function deriveCanonicalColumnWidths(doc: PMNode, table: PMNode, tablePos: number): number[] | null {
  const map = TableMap.get(table);
  const widths = new Array<number | null>(map.width).fill(null);
  let hasWidths = false;

  visitTableCells(doc, table, tablePos, (node, _nodePos, col, colspan) => {
    const colwidth = node.attrs.colwidth as number[] | null | undefined;
    if (!colwidth) return;

    for (let index = 0; index < colspan; index++) {
      const width = colwidth[index];
      if (typeof width !== "number" || width <= 0) continue;
      if (widths[col + index] != null) continue;
      widths[col + index] = Math.max(TABLE_CELL_MIN_WIDTH, Math.round(width));
      hasWidths = true;
    }
  });

  if (!hasWidths) return null;
  return widths.map((width, index) => width ?? nearestExplicitWidth(widths, index));
}

export function measureCanonicalTableWidth(doc: PMNode, table: PMNode, tablePos: number): number | null {
  const widths = deriveCanonicalColumnWidths(doc, table, tablePos);
  return widths ? widths.reduce((sum, width) => sum + width, 0) : null;
}

export function buildEvenWidths(columnCount: number, totalWidth: number): number[] {
  const clampedTotal = Math.max(TABLE_CELL_MIN_WIDTH * columnCount, Math.round(totalWidth));
  const base = Math.floor(clampedTotal / columnCount);
  const remainder = clampedTotal - base * columnCount;
  return Array.from({ length: columnCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function clearExplicitColumnWidths(state: EditorState, tr: Transaction, tablePos: number): boolean {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== "table") return false;

  let mutated = false;
  visitTableCells(state.doc, table, tablePos, (node, nodePos) => {
    if (node.attrs.colwidth == null) return;
    tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, colwidth: null });
    mutated = true;
  });

  return mutated;
}

export function applyExplicitColumnWidths(
  state: EditorState,
  tr: Transaction,
  tablePos: number,
  widths: number[],
): boolean {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== "table") return false;

  let mutated = false;
  visitTableCells(state.doc, table, tablePos, (node, nodePos, col, colspan) => {
    const nextColwidth = Array.from({ length: colspan }, (_, index) => widths[col + index] ?? TABLE_CELL_MIN_WIDTH);
    const current = node.attrs.colwidth as number[] | null | undefined;
    if (equalWidths(current, nextColwidth)) return;
    tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, colwidth: nextColwidth });
    mutated = true;
  });

  return mutated;
}

export function readRenderedColumnPixelWidths(
  view: EditorView,
  tablePos: number,
  columnCount: number,
): number[] | null {
  const tableEl = findTableElement(view, tablePos);
  if (!tableEl) return null;

  const firstRow = tableEl.querySelector<HTMLTableRowElement>(":scope > tbody > tr");
  if (!firstRow) return null;

  const widths = new Array(columnCount).fill(0);
  let col = 0;
  for (const cell of Array.from(firstRow.cells)) {
    const colspan = cell.colSpan || 1;
    const width = cell.getBoundingClientRect().width / colspan;
    for (let index = 0; index < colspan; index++) {
      widths[col + index] = Math.max(1, Math.round(width));
    }
    col += colspan;
  }

  return widths.some((width) => width === 0) ? null : widths;
}

function visitTableCells(
  doc: PMNode,
  table: PMNode,
  tablePos: number,
  visit: (node: PMNode, nodePos: number, col: number, colspan: number) => void,
) {
  const map = TableMap.get(table);
  const start = tablePos + 1;
  const end = tablePos + table.nodeSize - 1;

  doc.nodesBetween(start, end, (node, nodePos) => {
    const role = node.type.spec.tableRole;
    if (role !== "cell" && role !== "header_cell") return true;

    const colspan = (node.attrs.colspan as number) ?? 1;
    const cellStartInTable = nodePos - start;
    const idx = map.map.indexOf(cellStartInTable);
    if (idx >= 0) {
      visit(node, nodePos, idx % map.width, colspan);
    }
    return false;
  });
}

function equalWidths(a: number[] | null | undefined, b: number[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function nearestExplicitWidth(widths: Array<number | null>, index: number): number {
  let leftIndex = index - 1;
  while (leftIndex >= 0 && widths[leftIndex] == null) leftIndex -= 1;

  let rightIndex = index + 1;
  while (rightIndex < widths.length && widths[rightIndex] == null) rightIndex += 1;

  const leftWidth = leftIndex >= 0 ? widths[leftIndex] : null;
  const rightWidth = rightIndex < widths.length ? widths[rightIndex] : null;
  if (leftWidth != null && rightWidth != null) {
    return index - leftIndex <= rightIndex - index ? leftWidth : rightWidth;
  }
  if (leftWidth != null) return leftWidth;
  if (rightWidth != null) return rightWidth;
  return TABLE_CELL_MIN_WIDTH;
}
