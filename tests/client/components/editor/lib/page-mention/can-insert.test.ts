import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { schema as basicSchema } from "prosemirror-schema-basic";
import {
  canInsertPageMentionAtRange,
  canInsertPageMentions,
} from "@/client/components/editor/lib/page-mention/can-insert";
import { getSlashMenuItems, filterItems } from "@/client/components/editor/controllers/slash/items";

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

function createEditor(blockType: "paragraph" | "code_block"): Editor {
  const content = schema.node(blockType, null, [schema.text("[[roadmap")]);
  const doc = schema.node("doc", null, [content]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, content.content.size + 1),
  });

  return {
    isEditable: true,
    schema,
    state,
  } as unknown as Editor;
}

function fullTextRange(editor: Editor) {
  const contentSize = editor.state.doc.firstChild?.content.size ?? 0;
  return { from: 1, to: contentSize + 1 };
}

describe("page mention insertion availability", () => {
  it("allows mention insertion in inline text blocks", () => {
    const editor = createEditor("paragraph");

    expect(canInsertPageMentionAtRange(editor, fullTextRange(editor))).toBe(true);
  });

  it("blocks mention insertion inside code blocks", () => {
    const editor = createEditor("code_block");

    expect(canInsertPageMentionAtRange(editor, fullTextRange(editor))).toBe(false);
  });

  it("hides the slash-menu Link page item when the current selection cannot accept a mention", () => {
    const paragraphEditor = createEditor("paragraph");
    const codeBlockEditor = createEditor("code_block");
    const items = getSlashMenuItems({
      pageMention: { openPicker: vi.fn() },
      image: { insertImage: vi.fn() },
      emoji: { openPicker: vi.fn() },
      ai: null,
    });

    const paragraphTitles = filterItems(items, "", { editor: paragraphEditor }).map((item) => item.title);
    const codeBlockTitles = filterItems(items, "", { editor: codeBlockEditor }).map((item) => item.title);

    expect(paragraphTitles).toContain("Link page");
    expect(codeBlockTitles).not.toContain("Link page");
  });

  it("keeps the shared-editor insertion gate unchanged", () => {
    expect(canInsertPageMentions({ editable: true, workspaceId: "ws-1", shareToken: undefined })).toBe(true);
    expect(canInsertPageMentions({ editable: true, workspaceId: "ws-1", shareToken: "share-token" })).toBe(false);
  });
});
