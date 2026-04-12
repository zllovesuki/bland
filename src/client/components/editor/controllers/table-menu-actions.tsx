import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { moveTableColumn, moveTableRow } from "@tiptap/pm/tables";
import { TableMap } from "@tiptap/pm/tables";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  EqualApproximately,
  Heading,
  Merge,
  RotateCcw,
  Split,
  Trash2,
} from "lucide-react";
import { findTableElement } from "../extensions/table/dom";
import { columnCellSelection, rowCellSelection, setCaretInCell } from "../extensions/table/selection";
import { activeCellInfo, resolveOpenMenuState } from "../extensions/table/state";
import type { OpenMenuState } from "../extensions/table/state";

export interface TableMenuAction {
  key: string;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export type TableMenuSection = TableMenuAction[];

interface BaseResolvedTarget {
  table: PMNode;
  tablePos: number;
  tableKey: string;
  rowCount: number;
  colCount: number;
}

interface ResolvedRowTarget extends BaseResolvedTarget {
  kind: "row";
  index: number;
  anchorCellPos: number;
  row: number;
  col: number;
}

interface ResolvedColumnTarget extends BaseResolvedTarget {
  kind: "col";
  index: number;
  anchorCellPos: number;
  row: number;
  col: number;
}

interface ResolvedCornerTarget extends BaseResolvedTarget {
  kind: "corner";
  index: null;
}

export function buildRowMenuSections({
  editor,
  openMenu,
  onDone,
}: {
  editor: Editor;
  openMenu: OpenMenuState;
  onDone: () => void;
}): TableMenuSection[] {
  const target = resolveRowTarget(editor, openMenu);
  if (!target) return [];

  const run = (fn: (resolved: ResolvedRowTarget) => boolean) => {
    const current = resolveRowTarget(editor, openMenu);
    if (current) fn(current);
    onDone();
  };

  return [
    [
      {
        key: "row-insert-above",
        icon: <ChevronUp size={14} />,
        label: "Insert row above",
        onSelect: () =>
          run((resolved) => {
            focusRowTarget(editor, resolved);
            return editor.chain().focus(null, { scrollIntoView: false }).addRowBefore().run();
          }),
      },
      {
        key: "row-insert-below",
        icon: <ChevronDown size={14} />,
        label: "Insert row below",
        onSelect: () =>
          run((resolved) => {
            focusRowTarget(editor, resolved);
            return editor.chain().focus(null, { scrollIntoView: false }).addRowAfter().run();
          }),
      },
    ],
    [
      {
        key: "row-move-up",
        icon: <ArrowUp size={14} />,
        label: "Move row up",
        disabled: target.index === 0,
        onSelect: () =>
          run((resolved) => {
            if (resolved.index <= 0) return false;
            moveTableRow({ from: resolved.index, to: resolved.index - 1, pos: resolved.tablePos + 1, select: true })(
              editor.state,
              editor.view.dispatch.bind(editor.view),
            );
            return true;
          }),
      },
      {
        key: "row-move-down",
        icon: <ArrowDown size={14} />,
        label: "Move row down",
        disabled: target.index >= target.rowCount - 1,
        onSelect: () =>
          run((resolved) => {
            if (resolved.index >= resolved.rowCount - 1) return false;
            moveTableRow({ from: resolved.index, to: resolved.index + 1, pos: resolved.tablePos + 1, select: true })(
              editor.state,
              editor.view.dispatch.bind(editor.view),
            );
            return true;
          }),
      },
    ],
    [
      {
        key: "row-delete",
        icon: <Trash2 size={14} />,
        label: "Delete row",
        danger: true,
        disabled: target.rowCount <= 1,
        onSelect: () =>
          run((resolved) => {
            focusRowTarget(editor, resolved);
            return editor.chain().focus(null, { scrollIntoView: false }).deleteRow().run();
          }),
      },
    ],
  ];
}

export function buildColumnMenuSections({
  editor,
  openMenu,
  onDone,
}: {
  editor: Editor;
  openMenu: OpenMenuState;
  onDone: () => void;
}): TableMenuSection[] {
  const target = resolveColumnTarget(editor, openMenu);
  if (!target) return [];

  const run = (fn: (resolved: ResolvedColumnTarget) => boolean) => {
    const current = resolveColumnTarget(editor, openMenu);
    if (current) fn(current);
    onDone();
  };

  return [
    [
      {
        key: "col-insert-left",
        icon: <ChevronLeft size={14} />,
        label: "Insert column left",
        onSelect: () =>
          run((resolved) => {
            if (!focusColumnTarget(editor, resolved)) return false;
            return editor.chain().focus(null, { scrollIntoView: false }).addColumnBefore().run();
          }),
      },
      {
        key: "col-insert-right",
        icon: <ChevronRight size={14} />,
        label: "Insert column right",
        onSelect: () =>
          run((resolved) => {
            if (!focusColumnTarget(editor, resolved)) return false;
            return editor.chain().focus(null, { scrollIntoView: false }).addColumnAfter().run();
          }),
      },
    ],
    [
      {
        key: "col-move-left",
        icon: <ArrowLeft size={14} />,
        label: "Move column left",
        disabled: target.index === 0,
        onSelect: () =>
          run((resolved) => {
            if (resolved.index <= 0) return false;
            moveTableColumn({ from: resolved.index, to: resolved.index - 1, pos: resolved.tablePos + 1, select: true })(
              editor.state,
              editor.view.dispatch.bind(editor.view),
            );
            return true;
          }),
      },
      {
        key: "col-move-right",
        icon: <ArrowRight size={14} />,
        label: "Move column right",
        disabled: target.index >= target.colCount - 1,
        onSelect: () =>
          run((resolved) => {
            if (resolved.index >= resolved.colCount - 1) return false;
            moveTableColumn({ from: resolved.index, to: resolved.index + 1, pos: resolved.tablePos + 1, select: true })(
              editor.state,
              editor.view.dispatch.bind(editor.view),
            );
            return true;
          }),
      },
    ],
    [
      {
        key: "col-delete",
        icon: <Trash2 size={14} />,
        label: "Delete column",
        danger: true,
        disabled: target.colCount <= 1,
        onSelect: () =>
          run((resolved) => {
            const active = activeCellInfo(editor.state);
            const activeRow = active?.tablePos === resolved.tablePos ? active.row : resolved.row;
            if (!focusColumnTarget(editor, resolved)) return false;

            const didDelete = editor.chain().focus(null, { scrollIntoView: false }).deleteColumn().run();
            if (!didDelete) return false;

            const nextTable = editor.state.doc.nodeAt(resolved.tablePos);
            if (!nextTable || nextTable.type.spec.tableRole !== "table") return true;

            const nextMap = TableMap.get(nextTable);
            const targetRow = Math.min(activeRow, nextMap.height - 1);
            const targetCol = Math.min(resolved.col, nextMap.width - 1);
            setCaretInCell(editor.view, nextTable, resolved.tablePos, targetRow, targetCol);

            if (targetCol === nextMap.width - 1) {
              requestAnimationFrame(() => {
                const wrapper = findTableElement(editor.view, resolved.tablePos)?.closest<HTMLElement>(".tableWrapper");
                if (!wrapper) return;
                wrapper.scrollLeft = wrapper.scrollWidth;
              });
            }

            return true;
          }),
      },
    ],
  ];
}

export function buildTableMenuSections({
  editor,
  openMenu,
  canMerge,
  canSplit,
  canResetWidths,
  onDone,
}: {
  editor: Editor;
  openMenu: OpenMenuState;
  canMerge: boolean;
  canSplit: boolean;
  canResetWidths: boolean;
  onDone: () => void;
}): TableMenuSection[] {
  const target = resolveCornerTarget(editor, openMenu);
  if (!target) return [];

  const run = (fn: (resolved: ResolvedCornerTarget) => boolean) => {
    const current = resolveCornerTarget(editor, openMenu);
    if (current) fn(current);
    onDone();
  };

  return [
    [
      {
        key: "table-toggle-header-row",
        icon: <Heading size={14} />,
        label: "Toggle header row",
        onSelect: () =>
          run((resolved) => {
            focusTableTarget(editor, resolved);
            return editor.chain().focus(null, { scrollIntoView: false }).toggleHeaderRow().run();
          }),
      },
      {
        key: "table-toggle-header-column",
        icon: <Heading size={14} />,
        label: "Toggle header column",
        onSelect: () =>
          run((resolved) => {
            focusTableTarget(editor, resolved);
            return editor.chain().focus(null, { scrollIntoView: false }).toggleHeaderColumn().run();
          }),
      },
    ],
    [
      {
        key: "table-merge-cells",
        icon: <Merge size={14} />,
        label: "Merge cells",
        disabled: !canMerge,
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).mergeCells().run()),
      },
      {
        key: "table-split-cell",
        icon: <Split size={14} />,
        label: "Split cell",
        disabled: !canSplit,
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).splitCell().run()),
      },
    ],
    [
      {
        key: "table-reset-widths",
        icon: <RotateCcw size={14} />,
        label: "Reset column widths",
        disabled: !canResetWidths,
        onSelect: () =>
          run((resolved) =>
            editor.chain().focus(null, { scrollIntoView: false }).resetTableColumnWidths(resolved.tablePos).run(),
          ),
      },
      {
        key: "table-distribute-widths",
        icon: <EqualApproximately size={14} />,
        label: "Distribute columns evenly",
        onSelect: () =>
          run((resolved) =>
            editor.chain().focus(null, { scrollIntoView: false }).distributeTableColumnsEvenly(resolved.tablePos).run(),
          ),
      },
      {
        key: "table-fit-widths",
        icon: <ArrowLeftRight size={14} />,
        label: "Fit all columns to content",
        onSelect: () =>
          run((resolved) =>
            editor.chain().focus(null, { scrollIntoView: false }).fitTableColumnsToContent(resolved.tablePos).run(),
          ),
      },
    ],
    [
      {
        key: "table-delete",
        icon: <Trash2 size={14} />,
        label: "Delete table",
        danger: true,
        onSelect: () =>
          run((resolved) => {
            focusTableTarget(editor, resolved);
            return editor.chain().focus(null, { scrollIntoView: false }).deleteTable().run();
          }),
      },
    ],
  ];
}

function resolveRowTarget(editor: Editor, openMenu: OpenMenuState): ResolvedRowTarget | null {
  const resolved = resolveOpenMenuState(editor.state.doc, openMenu);
  return resolved?.kind === "row" ? (resolved as ResolvedRowTarget) : null;
}

function resolveColumnTarget(editor: Editor, openMenu: OpenMenuState): ResolvedColumnTarget | null {
  const resolved = resolveOpenMenuState(editor.state.doc, openMenu);
  return resolved?.kind === "col" ? (resolved as ResolvedColumnTarget) : null;
}

function resolveCornerTarget(editor: Editor, openMenu: OpenMenuState): ResolvedCornerTarget | null {
  const resolved = resolveOpenMenuState(editor.state.doc, openMenu);
  return resolved?.kind === "corner" ? (resolved as ResolvedCornerTarget) : null;
}

function focusRowTarget(editor: Editor, target: ResolvedRowTarget) {
  const selection = rowCellSelection(editor.state.doc, target.tablePos, target.table, target.row);
  if (selection) {
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    return;
  }
  setCaretInCell(editor.view, target.table, target.tablePos, target.row, 0);
}

function focusColumnTarget(editor: Editor, target: ResolvedColumnTarget): boolean {
  const selection = columnCellSelection(editor.state.doc, target.tablePos, target.table, target.col);
  if (!selection) return false;
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  return true;
}

function focusTableTarget(editor: Editor, target: ResolvedCornerTarget) {
  setCaretInCell(editor.view, target.table, target.tablePos, 0, 0);
}
