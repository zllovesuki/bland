import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { filterItems } from "@/client/components/editor/controllers/slash/items";
import { createInsertPaletteItems } from "@/client/components/editor/lib/insert-palette";
import type { EditorRuntimeSnapshot } from "@/client/components/editor/editor-runtime-context";
import type { EditorAffordance } from "@/client/lib/affordance/editor";

const schema = new Schema({
  nodes: basicSchema.spec.nodes.addBefore("text", "pageMention", {
    inline: true,
    group: "inline",
    atom: true,
    selectable: true,
    attrs: { pageId: { default: null } },
    toDOM(node) {
      return ["span", { "data-page-id": node.attrs.pageId ?? "" }];
    },
    parseDOM: [{ tag: "span[data-page-id]" }],
  }),
  marks: basicSchema.spec.marks,
});

function createEditor(blockType: "paragraph" | "code_block", editable = true): Editor {
  const content = schema.node(blockType, null, [schema.text("[[roadmap")]);
  const doc = schema.node("doc", null, [content]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, content.content.size + 1),
  });

  return {
    isEditable: editable,
    schema,
    state,
  } as unknown as Editor;
}

function visibleTitles(
  input?: Partial<{
    runtime: EditorRuntimeSnapshot;
    affordance: EditorAffordance;
    blockType: "paragraph" | "code_block";
  }>,
) {
  const runtime: EditorRuntimeSnapshot = input?.runtime ?? {
    workspaceId: "ws-1",
    pageId: "page-1",
    shareToken: undefined,
  };
  const affordance: EditorAffordance = input?.affordance ?? {
    documentEditable: true,
    canInsertPageMentions: true,
    canInsertImages: true,
  };
  const editor = createEditor(input?.blockType ?? "paragraph", affordance.documentEditable);

  return filterItems(
    createInsertPaletteItems({
      getRuntime: () => runtime,
      getAffordance: () => affordance,
      getPageMentionCandidates: () => [{ pageId: "page-2", title: "Roadmap", icon: null }],
    }),
    "",
    { editor },
  ).map((item) => item.title);
}

describe("insert palette", () => {
  it("keeps workspace paragraph insert affordances aligned", () => {
    const titles = visibleTitles();

    expect(titles).toContain("Link page");
    expect(titles).toContain("Image");
    expect(titles).toContain("Emoji");
  });

  it("hides Link page when the current selection cannot accept a mention", () => {
    const titles = visibleTitles({ blockType: "code_block" });

    expect(titles).not.toContain("Link page");
    expect(titles).toContain("Image");
  });

  it("respects disabled insert affordances across entrypoints", () => {
    const titles = visibleTitles({
      affordance: {
        documentEditable: true,
        canInsertPageMentions: false,
        canInsertImages: false,
      },
    });

    expect(titles).not.toContain("Link page");
    expect(titles).not.toContain("Image");
    expect(titles).toContain("Emoji");
  });

  it("keeps image insertion hidden when runtime has no workspace context", () => {
    const titles = visibleTitles({
      runtime: {
        workspaceId: undefined,
        pageId: "page-1",
        shareToken: undefined,
      },
      affordance: {
        documentEditable: true,
        canInsertPageMentions: true,
        canInsertImages: true,
      },
    });

    expect(titles).toContain("Link page");
    expect(titles).not.toContain("Image");
  });
});
