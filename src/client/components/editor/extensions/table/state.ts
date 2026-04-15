import type { Node as PMNode } from "@tiptap/pm/model";
import { PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { TableMap, isInTable } from "@tiptap/pm/tables";

export interface CornerOpenMenuState {
  kind: "corner";
  index: null;
  tablePos: number;
  tableKey: string;
}

export interface TargetedOpenMenuState {
  kind: "row" | "col";
  index: number;
  tablePos: number;
  tableKey: string;
  anchorCellPos: number;
}

export type OpenMenuState = CornerOpenMenuState | TargetedOpenMenuState;

export interface TableHandlesPluginState {
  openMenu: OpenMenuState | null;
  isTyping: boolean;
}

export interface TableHandlesMeta {
  openMenu?: OpenMenuState | "close";
  isTyping?: boolean;
}

export interface ActiveCellInfo {
  tablePos: number;
  tableKey: string;
  row: number;
  col: number;
}

interface ResolvedTableCell {
  table: PMNode;
  tablePos: number;
  tableKey: string;
  cellPos: number;
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
}

export type ResolvedOpenMenuState =
  | (CornerOpenMenuState & {
      table: PMNode;
      rowCount: number;
      colCount: number;
    })
  | (TargetedOpenMenuState & ResolvedTableCell);

export const tableHandlesKey = new PluginKey<TableHandlesPluginState>("tableHandles");

export function createTableHandlesPluginState(): TableHandlesPluginState {
  return { openMenu: null, isTyping: false };
}

export function tableKeyFromPos(pos: number): string {
  return `t-${pos}`;
}

export function tableHandleSelector(openMenu: OpenMenuState | null): string | null {
  if (!openMenu) return null;
  return openMenu.kind === "corner"
    ? `[data-table-handle-kind="corner"][data-table-key="${openMenu.tableKey}"]`
    : `[data-table-handle-kind="${openMenu.kind}"][data-table-key="${openMenu.tableKey}"][data-index="${openMenu.index}"]`;
}

export function applyTableHandlesState(tr: Transaction, value: TableHandlesPluginState): TableHandlesPluginState {
  const meta = tr.getMeta(tableHandlesKey) as TableHandlesMeta | undefined;
  let next = value;

  if (meta) {
    if (meta.openMenu !== undefined) {
      next = { ...next, openMenu: meta.openMenu === "close" ? null : meta.openMenu };
    }
    if (meta.isTyping !== undefined) {
      next = { ...next, isTyping: meta.isTyping };
    }
  }

  if (!next.openMenu) return next;

  const mappedTablePos = tr.mapping.map(next.openMenu.tablePos);
  const baseMenu =
    next.openMenu.kind === "corner"
      ? { ...next.openMenu, tablePos: mappedTablePos, tableKey: tableKeyFromPos(mappedTablePos) }
      : mapTargetedOpenMenu(tr, next.openMenu, mappedTablePos);
  if (!baseMenu) {
    return { ...next, openMenu: null };
  }

  const resolved = resolveOpenMenuState(tr.doc, baseMenu);
  if (!resolved) return { ...next, openMenu: null };

  return {
    ...next,
    openMenu: stripResolvedOpenMenu(resolved),
  };
}

export function activeCellInfo(state: EditorState): ActiveCellInfo | null {
  if (!isInTable(state)) return null;

  const $pos = state.selection.$from;
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    const role = node.type.spec.tableRole;
    if (role !== "cell" && role !== "header_cell") continue;

    const tableDepth = depth - 2;
    if (tableDepth < 0) return null;

    const table = $pos.node(tableDepth);
    if (table.type.spec.tableRole !== "table") return null;

    const tablePos = $pos.before(tableDepth);
    const cell = resolveTableCell(state.doc, tablePos, $pos.before(depth));
    if (!cell) return null;

    return {
      tablePos: cell.tablePos,
      tableKey: cell.tableKey,
      row: cell.row,
      col: cell.col,
    };
  }

  return null;
}

export function isPrintableKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const { key } = event;
  if (key === "Backspace" || key === "Delete" || key === "Enter") return true;
  return key.length === 1;
}

function cellPosAt(tablePos: number, table: PMNode, row: number, col: number): number | null {
  const map = TableMap.get(table);
  if (row < 0 || row >= map.height || col < 0 || col >= map.width) return null;
  return tablePos + 1 + map.positionAt(row, col, table);
}

export function createOpenMenuState(
  kind: OpenMenuState["kind"],
  index: number | null,
  tablePos: number,
  table: PMNode,
): OpenMenuState | null {
  if (kind === "corner") {
    return { kind, index: null, tablePos, tableKey: tableKeyFromPos(tablePos) };
  }
  if (index === null) return null;

  const anchorCellPos = findAnchorCellPos(kind, tablePos, table, index);
  if (anchorCellPos === null) return null;

  return {
    kind,
    index,
    tablePos,
    tableKey: tableKeyFromPos(tablePos),
    anchorCellPos,
  };
}

export function resolveOpenMenuState(doc: PMNode, openMenu: OpenMenuState): ResolvedOpenMenuState | null {
  const table = doc.nodeAt(openMenu.tablePos);
  if (!table || table.type.spec.tableRole !== "table") return null;

  const map = TableMap.get(table);
  if (openMenu.kind === "corner") {
    return {
      ...openMenu,
      table,
      rowCount: map.height,
      colCount: map.width,
    };
  }

  const cell = resolveTableCell(doc, openMenu.tablePos, openMenu.anchorCellPos);
  if (!cell) return null;

  return {
    ...openMenu,
    ...cell,
    index: openMenu.kind === "row" ? cell.row : cell.col,
  };
}

function resolveTableCell(doc: PMNode, tablePos: number, cellPos: number): ResolvedTableCell | null {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== "table") return null;

  const map = TableMap.get(table);
  const tableStart = tablePos + 1;
  const cellStartInTable = cellPos - tableStart;
  const mapIdx = map.map.indexOf(cellStartInTable);
  if (mapIdx < 0) return null;

  return {
    table,
    tablePos,
    tableKey: tableKeyFromPos(tablePos),
    cellPos,
    row: Math.floor(mapIdx / map.width),
    col: mapIdx % map.width,
    rowCount: map.height,
    colCount: map.width,
  };
}

function mapTargetedOpenMenu(
  tr: Transaction,
  openMenu: TargetedOpenMenuState,
  mappedTablePos: number,
): TargetedOpenMenuState | null {
  const mappedAnchor = tr.mapping.mapResult(openMenu.anchorCellPos, 1);
  if (mappedAnchor.deleted) return null;

  return {
    ...openMenu,
    tablePos: mappedTablePos,
    tableKey: tableKeyFromPos(mappedTablePos),
    anchorCellPos: mappedAnchor.pos,
  };
}

function stripResolvedOpenMenu(openMenu: ResolvedOpenMenuState): OpenMenuState {
  if (openMenu.kind === "corner") {
    return {
      kind: "corner",
      index: null,
      tablePos: openMenu.tablePos,
      tableKey: openMenu.tableKey,
    };
  }

  return {
    kind: openMenu.kind,
    index: openMenu.index,
    tablePos: openMenu.tablePos,
    tableKey: openMenu.tableKey,
    anchorCellPos: openMenu.anchorCellPos,
  };
}

function findAnchorCellPos(
  kind: TargetedOpenMenuState["kind"],
  tablePos: number,
  table: PMNode,
  index: number,
): number | null {
  const map = TableMap.get(table);
  if (kind === "row") {
    for (let col = 0; col < map.width; col++) {
      const cellPos = cellPosAt(tablePos, table, index, col);
      if (cellPos === null) continue;
      if (map.findCell(cellPos - tablePos - 1).top === index) return cellPos;
    }
    return cellPosAt(tablePos, table, index, 0);
  }

  for (let row = 0; row < map.height; row++) {
    const cellPos = cellPosAt(tablePos, table, row, index);
    if (cellPos === null) continue;
    if (map.findCell(cellPos - tablePos - 1).left === index) return cellPos;
  }
  return cellPosAt(tablePos, table, 0, index);
}
