import { describe, expect, it, vi } from "vitest";
import { getSchema } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { addColumnBefore, addRowBefore, CellSelection, TableMap } from "@tiptap/pm/tables";
import {
  buildColumnMenuSections,
  buildRowMenuSections,
} from "@/client/components/editor/controllers/table-menu-actions";
import { applyTableHandlesState, createOpenMenuState } from "@/client/components/editor/extensions/table/state";
import { deriveCanonicalColumnWidths, snapshotTableWidths } from "@/client/components/editor/extensions/table/widths";

const schema = getSchema([
  StarterKit.configure({ undoRedo: false }),
  TableKit.configure({
    table: {
      resizable: true,
      renderWrapper: true,
    },
  }),
]);

describe("table collaboration helpers", () => {
  it("derives canonical widths from partial shared colwidth state", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, rowspan: 1, colwidth: [120, 0] },
                  content: [{ type: "paragraph" }],
                },
                {
                  type: "tableHeader",
                  attrs: { colspan: 1, rowspan: 1, colwidth: [200] },
                  content: [{ type: "paragraph" }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph" }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph" }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph" }],
                },
              ],
            },
          ],
        },
      ],
    });

    const table = doc.firstChild;
    expect(table).not.toBeNull();
    expect(snapshotTableWidths(table!)).toEqual({ hasSome: true, hasAll: false });
    expect(deriveCanonicalColumnWidths(doc, table!, 0)).toEqual([120, 120, 200]);
  });

  it("remaps an open row menu target after a row is inserted above it", () => {
    const doc = createThreeRowTableDoc();
    const table = doc.firstChild;
    expect(table).not.toBeNull();

    const openMenu = createOpenMenuState("row", 2, 0, table!);
    expect(openMenu?.kind).toBe("row");

    const tr = insertRowBefore(doc, 0);
    const nextState = applyTableHandlesState(tr, { openMenu, isTyping: false });

    expect(nextState.openMenu?.kind).toBe("row");
    if (nextState.openMenu?.kind === "row") {
      expect(nextState.openMenu.index).toBe(3);
    }
  });

  it("remaps an open column menu target after a column is inserted before it", () => {
    const doc = createThreeRowTableDoc();
    const table = doc.firstChild;
    expect(table).not.toBeNull();

    const openMenu = createOpenMenuState("col", 1, 0, table!);
    expect(openMenu?.kind).toBe("col");

    const tr = insertColumnBefore(doc, 0);
    const nextState = applyTableHandlesState(tr, { openMenu, isTyping: false });

    expect(nextState.openMenu?.kind).toBe("col");
    if (nextState.openMenu?.kind === "col") {
      expect(nextState.openMenu.index).toBe(2);
    }
  });

  it("normalizes shared widths after inserting a column into an explicitly sized table", () => {
    const doc = createExplicitWidthTableDoc();
    const nextTr = insertColumnBefore(doc, 1);
    const nextDoc = nextTr.doc;
    const nextTable = nextDoc.firstChild;

    expect(nextTable).not.toBeNull();
    expect(snapshotTableWidths(nextTable!)).toEqual({ hasSome: true, hasAll: false });
    expect(deriveCanonicalColumnWidths(nextDoc, nextTable!, 0)).toEqual([120, 120, 240]);
  });

  it("offers explicit row selection from the row menu without restoring trigger focus", () => {
    const doc = createThreeRowTableDoc();
    const table = doc.firstChild;
    expect(table).not.toBeNull();

    const openMenu = createOpenMenuState("row", 1, 0, table!);
    expect(openMenu?.kind).toBe("row");

    const state = EditorState.create({ schema, doc });
    let dispatchedSelection: EditorState["selection"] | null = null;
    const focus = vi.fn();
    const onDone = vi.fn();
    const editor = {
      state,
      view: {
        dispatch: vi.fn((tr: typeof state.tr) => {
          dispatchedSelection = tr.selection;
        }),
        focus,
      },
    };

    const action = buildRowMenuSections({
      editor: editor as any,
      openMenu: openMenu!,
      onDone,
    })
      .flat()
      .find((item) => item.key === "row-select");

    expect(action).toBeDefined();
    action?.onSelect();

    expect(dispatchedSelection).toBeInstanceOf(CellSelection);
    expect(focus).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it("offers explicit column selection from the column menu without restoring trigger focus", () => {
    const doc = createThreeRowTableDoc();
    const table = doc.firstChild;
    expect(table).not.toBeNull();

    const openMenu = createOpenMenuState("col", 1, 0, table!);
    expect(openMenu?.kind).toBe("col");

    const state = EditorState.create({ schema, doc });
    let dispatchedSelection: EditorState["selection"] | null = null;
    const focus = vi.fn();
    const onDone = vi.fn();
    const editor = {
      state,
      view: {
        dispatch: vi.fn((tr: typeof state.tr) => {
          dispatchedSelection = tr.selection;
        }),
        focus,
      },
    };

    const action = buildColumnMenuSections({
      editor: editor as any,
      openMenu: openMenu!,
      onDone,
    })
      .flat()
      .find((item) => item.key === "col-select");

    expect(action).toBeDefined();
    action?.onSelect();

    expect(dispatchedSelection).toBeInstanceOf(CellSelection);
    expect(focus).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith(false);
  });
});

function createThreeRowTableDoc() {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          createRow("tableHeader", "tableHeader"),
          createRow("tableCell", "tableCell"),
          createRow("tableCell", "tableCell"),
        ],
      },
    ],
  });
}

function createExplicitWidthTableDoc() {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
                content: [{ type: "paragraph" }],
              },
              {
                type: "tableHeader",
                attrs: { colspan: 1, rowspan: 1, colwidth: [240] },
                content: [{ type: "paragraph" }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
                content: [{ type: "paragraph" }],
              },
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1, colwidth: [240] },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
    ],
  });
}

function createRow(leftType: "tableHeader" | "tableCell", rightType: "tableHeader" | "tableCell") {
  return {
    type: "tableRow",
    content: [
      {
        type: leftType,
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: "paragraph" }],
      },
      {
        type: rightType,
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: "paragraph" }],
      },
    ],
  };
}

function insertRowBefore(doc: ReturnType<typeof createThreeRowTableDoc>, rowIndex: number) {
  const table = doc.firstChild!;
  const map = TableMap.get(table);
  const cellPos = 1 + map.positionAt(rowIndex, 0, table);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(cellPos + 1)),
  });

  let nextTr = null;
  addRowBefore(state, (tr) => {
    nextTr = tr;
  });

  expect(nextTr).not.toBeNull();
  return nextTr!;
}

function insertColumnBefore(doc: ReturnType<typeof createThreeRowTableDoc>, colIndex: number) {
  const table = doc.firstChild!;
  const map = TableMap.get(table);
  const cellPos = 1 + map.positionAt(0, colIndex, table);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(cellPos + 1)),
  });

  let nextTr = null;
  addColumnBefore(state, (tr) => {
    nextTr = tr;
  });

  expect(nextTr).not.toBeNull();
  return nextTr!;
}
