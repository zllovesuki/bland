import { PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { TableMap, isInTable } from "@tiptap/pm/tables";

export interface OpenMenuState {
  kind: "row" | "col" | "corner";
  index: number | null;
  tablePos: number;
  tableKey: string;
}

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

  const mapped = tr.mapping.map(next.openMenu.tablePos);
  const node = tr.doc.nodeAt(mapped);
  if (!node || node.type.spec.tableRole !== "table") {
    return { ...next, openMenu: null };
  }
  if (mapped === next.openMenu.tablePos) return next;

  return {
    ...next,
    openMenu: { ...next.openMenu, tablePos: mapped, tableKey: tableKeyFromPos(mapped) },
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
    const cellStartInTable = $pos.before(depth) - tablePos - 1;
    const map = TableMap.get(table);
    const mapIdx = map.map.indexOf(cellStartInTable);
    if (mapIdx < 0) return null;

    return {
      tablePos,
      tableKey: tableKeyFromPos(tablePos),
      row: Math.floor(mapIdx / map.width),
      col: mapIdx % map.width,
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
