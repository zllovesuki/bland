import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { addColumnBefore, addRowBefore, TableMap } from "@tiptap/pm/tables";
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
