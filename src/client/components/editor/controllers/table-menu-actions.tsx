import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
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
import { findTableElement, setCaretInCell } from "../extensions/table/dom";
import { activeCellInfo } from "../extensions/table/state";
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

export function buildRowMenuSections({
  editor,
  openMenu,
  rowCount,
  onDone,
}: {
  editor: Editor;
  openMenu: OpenMenuState;
  rowCount: number;
  onDone: () => void;
}): TableMenuSection[] {
  const { index, tablePos } = openMenu;
  if (index === null) return [];

  const run = (fn: () => boolean) => {
    fn();
    onDone();
  };
  const moveRow = (delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rowCount) return;
    moveTableRow({ from: index, to: target, pos: tablePos + 1, select: true })(
      editor.state,
      editor.view.dispatch.bind(editor.view),
    );
    onDone();
  };

  return [
    [
      {
        key: "row-insert-above",
        icon: <ChevronUp size={14} />,
        label: "Insert row above",
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).addRowBefore().run()),
      },
      {
        key: "row-insert-below",
        icon: <ChevronDown size={14} />,
        label: "Insert row below",
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).addRowAfter().run()),
      },
    ],
    [
      {
        key: "row-move-up",
        icon: <ArrowUp size={14} />,
        label: "Move row up",
        disabled: index === 0,
        onSelect: () => moveRow(-1),
      },
      {
        key: "row-move-down",
        icon: <ArrowDown size={14} />,
        label: "Move row down",
        disabled: index >= rowCount - 1,
        onSelect: () => moveRow(1),
      },
    ],
    [
      {
        key: "row-delete",
        icon: <Trash2 size={14} />,
        label: "Delete row",
        danger: true,
        disabled: rowCount <= 1,
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).deleteRow().run()),
      },
    ],
  ];
}

export function buildColumnMenuSections({
  editor,
  openMenu,
  colCount,
  onDone,
}: {
  editor: Editor;
  openMenu: OpenMenuState;
  colCount: number;
  onDone: () => void;
}): TableMenuSection[] {
  const { index, tablePos } = openMenu;
  if (index === null) return [];

  const run = (fn: () => boolean) => {
    fn();
    onDone();
  };
  const moveCol = (delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= colCount) return;
    moveTableColumn({ from: index, to: target, pos: tablePos + 1, select: true })(
      editor.state,
      editor.view.dispatch.bind(editor.view),
    );
    onDone();
  };
  const deleteColumn = () => {
    const active = activeCellInfo(editor.state);
    const activeRow = active?.tablePos === tablePos ? active.row : 0;
    const didDelete = editor.chain().focus(null, { scrollIntoView: false }).deleteColumn().run();
    if (!didDelete) {
      onDone();
      return;
    }

    const nextTable = editor.state.doc.nodeAt(tablePos);
    if (!nextTable || nextTable.type.spec.tableRole !== "table") {
      onDone();
      return;
    }

    const nextMap = TableMap.get(nextTable);
    const targetRow = Math.min(activeRow, nextMap.height - 1);
    const targetCol = Math.min(index, nextMap.width - 1);
    setCaretInCell(editor.view, nextTable, tablePos, targetRow, targetCol);

    if (targetCol === nextMap.width - 1) {
      requestAnimationFrame(() => {
        const wrapper = findTableElement(editor.view, tablePos)?.closest<HTMLElement>(".tableWrapper");
        if (!wrapper) return;
        wrapper.scrollLeft = wrapper.scrollWidth;
      });
    }

    onDone();
  };

  return [
    [
      {
        key: "col-insert-left",
        icon: <ChevronLeft size={14} />,
        label: "Insert column left",
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).addColumnBefore().run()),
      },
      {
        key: "col-insert-right",
        icon: <ChevronRight size={14} />,
        label: "Insert column right",
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).addColumnAfter().run()),
      },
    ],
    [
      {
        key: "col-move-left",
        icon: <ArrowLeft size={14} />,
        label: "Move column left",
        disabled: index === 0,
        onSelect: () => moveCol(-1),
      },
      {
        key: "col-move-right",
        icon: <ArrowRight size={14} />,
        label: "Move column right",
        disabled: index >= colCount - 1,
        onSelect: () => moveCol(1),
      },
    ],
    [
      {
        key: "col-delete",
        icon: <Trash2 size={14} />,
        label: "Delete column",
        danger: true,
        disabled: colCount <= 1,
        onSelect: deleteColumn,
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
  const run = (fn: () => boolean) => {
    fn();
    onDone();
  };

  return [
    [
      {
        key: "table-toggle-header-row",
        icon: <Heading size={14} />,
        label: "Toggle header row",
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).toggleHeaderRow().run()),
      },
      {
        key: "table-toggle-header-column",
        icon: <Heading size={14} />,
        label: "Toggle header column",
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).toggleHeaderColumn().run()),
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
          run(() =>
            editor.chain().focus(null, { scrollIntoView: false }).resetTableColumnWidths(openMenu.tablePos).run(),
          ),
      },
      {
        key: "table-distribute-widths",
        icon: <EqualApproximately size={14} />,
        label: "Distribute columns evenly",
        onSelect: () =>
          run(() =>
            editor.chain().focus(null, { scrollIntoView: false }).distributeTableColumnsEvenly(openMenu.tablePos).run(),
          ),
      },
      {
        key: "table-fit-widths",
        icon: <ArrowLeftRight size={14} />,
        label: "Fit all columns to content",
        onSelect: () =>
          run(() =>
            editor.chain().focus(null, { scrollIntoView: false }).fitTableColumnsToContent(openMenu.tablePos).run(),
          ),
      },
    ],
    [
      {
        key: "table-delete",
        icon: <Trash2 size={14} />,
        label: "Delete table",
        danger: true,
        onSelect: () => run(() => editor.chain().focus(null, { scrollIntoView: false }).deleteTable().run()),
      },
    ],
  ];
}
