import type { EditorView } from "@tiptap/pm/view";
import { TableMap, moveTableColumn, moveTableRow } from "@tiptap/pm/tables";
import { DRAG_THRESHOLD_PX } from "./constants";
import { buildColumnEntries, findTableForWrapper, rowDropIndex, columnDropIndex } from "./dom";
import { createOpenMenuState, type OpenMenuState } from "./state";

export type DragState =
  | {
      kind: "reorder-row";
      sourceIndex: number;
      tablePos: number;
      wrapper: HTMLElement;
      pointerId: number;
      dropIndex: number | null;
      moved: boolean;
      startX: number;
      startY: number;
    }
  | {
      kind: "reorder-column";
      sourceIndex: number;
      tablePos: number;
      wrapper: HTMLElement;
      pointerId: number;
      dropIndex: number | null;
      moved: boolean;
      startX: number;
      startY: number;
    };

export interface DragIndicatorState {
  orientation: "row" | "column";
  top: number;
  left: number;
  width: number;
  height: number;
}

export function createRowDragState(
  view: EditorView,
  wrapper: HTMLElement,
  rowIndex: number,
  pointerId: number,
  startX: number,
  startY: number,
): DragState | null {
  const info = findTableForWrapper(view, wrapper);
  if (!info) return null;

  return {
    kind: "reorder-row",
    sourceIndex: rowIndex,
    tablePos: info.pos,
    wrapper,
    pointerId,
    dropIndex: null,
    moved: false,
    startX,
    startY,
  };
}

export function createColumnDragState(
  view: EditorView,
  wrapper: HTMLElement,
  logicalCol: number,
  pointerId: number,
  startX: number,
  startY: number,
): DragState | null {
  const info = findTableForWrapper(view, wrapper);
  if (!info) return null;

  return {
    kind: "reorder-column",
    sourceIndex: logicalCol,
    tablePos: info.pos,
    wrapper,
    pointerId,
    dropIndex: null,
    moved: false,
    startX,
    startY,
  };
}

export function updateDragState(
  view: EditorView,
  state: DragState,
  clientX: number,
  clientY: number,
  toLocal: (rect: DOMRect) => {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  },
): DragIndicatorState | null {
  const table = state.wrapper.querySelector<HTMLTableElement>(":scope > table");
  if (!table) return null;

  if (!state.moved) {
    const dx = Math.abs(clientX - state.startX);
    const dy = Math.abs(clientY - state.startY);
    if (dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return null;
    state.moved = true;
  }

  const tableLocal = toLocal(table.getBoundingClientRect());
  if (state.kind === "reorder-row") {
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr"));
    if (rows.length === 0) return null;

    const index = rowDropIndex(rows, clientY);
    state.dropIndex = index;
    const top =
      index < rows.length
        ? toLocal(rows[index].getBoundingClientRect()).top
        : toLocal(rows[rows.length - 1].getBoundingClientRect()).bottom;

    return {
      orientation: "row",
      top: top - 1,
      left: tableLocal.left,
      width: tableLocal.width,
      height: 2,
    };
  }

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr"));
  if (rows.length === 0) return null;

  const columnEntries = buildColumnEntries(rows[0]);
  if (columnEntries.length === 0) return null;

  const info = findTableForWrapper(view, state.wrapper);
  if (!info) return null;

  const map = TableMap.get(info.node);
  const index = columnDropIndex(columnEntries, map.width, clientX);
  state.dropIndex = index;

  const left =
    index >= map.width
      ? toLocal(columnEntries[columnEntries.length - 1].domCell.getBoundingClientRect()).right
      : toLocal(
          (
            columnEntries.find((entry) => entry.logicalCol === index) ?? columnEntries[0]
          ).domCell.getBoundingClientRect(),
        ).left;

  return {
    orientation: "column",
    top: tableLocal.top,
    left: left - 1,
    width: 2,
    height: tableLocal.height,
  };
}

export function completeDrag(view: EditorView, state: DragState): OpenMenuState | null {
  if (!state.moved) {
    const table = view.state.doc.nodeAt(state.tablePos);
    if (!table || table.type.spec.tableRole !== "table") return null;
    return createOpenMenuState(state.kind === "reorder-row" ? "row" : "col", state.sourceIndex, state.tablePos, table);
  }

  const dropIndex = state.dropIndex;
  if (dropIndex === null || dropIndex === state.sourceIndex || dropIndex === state.sourceIndex + 1) {
    return null;
  }

  const target = dropIndex > state.sourceIndex ? dropIndex - 1 : dropIndex;
  const pos = state.tablePos + 1;
  if (state.kind === "reorder-row") {
    moveTableRow({ from: state.sourceIndex, to: target, pos, select: true })(view.state, view.dispatch.bind(view));
    return null;
  }

  moveTableColumn({ from: state.sourceIndex, to: target, pos, select: true })(view.state, view.dispatch.bind(view));
  return null;
}
