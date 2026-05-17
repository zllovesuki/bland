import { describe, expect, it } from "vitest";
import { getSchema, type AnyExtension, type Extensions } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import { StarterKit } from "@tiptap/starter-kit";
import type { Schema } from "@tiptap/pm/model";
import { countCharacters, countWords, createHeadlessEditorExtensions } from "@/shared/editor/schema";
import { CalloutExtension } from "@/client/components/editor/extensions/callout";
import { HighlightedCodeBlock } from "@/client/components/editor/extensions/code-block/extension";
import { DetailsBlockExtensions } from "@/client/components/editor/extensions/details-block";
import { EditorEmoji } from "@/client/components/editor/extensions/emoji";
import { ShareAwareImage } from "@/client/components/editor/extensions/image/node";
import { PageMentionNode } from "@/client/components/editor/extensions/page-mention/node";
import { createTableExtensions } from "@/client/components/editor/extensions/table-extensions";
import { TopLevelBlockIdentity } from "@/client/components/editor/extensions/top-level-block-identity";

const CUSTOM_NODE_NAMES = [
  "callout",
  "codeBlock",
  "details",
  "detailsSummary",
  "detailsContent",
  "image",
  "pageMention",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
] as const;

const MARK_NAMES = ["bold", "italic", "strike", "code", "link", "textStyle"] as const;

function createClientSchemaExtensions(): Extensions {
  return [
    StarterKit.configure({
      undoRedo: false,
      dropcursor: false,
      link: { openOnClick: false, autolink: true },
      codeBlock: false,
    }),
    Typography.configure({
      emDash: false,
      openDoubleQuote: false,
      closeDoubleQuote: false,
      openSingleQuote: false,
      closeSingleQuote: false,
      leftArrow: false,
      rightArrow: false,
      copyright: false,
      trademark: false,
      servicemark: false,
      registeredTrademark: false,
      oneHalf: false,
      plusMinus: false,
      notEqual: false,
      laquo: false,
      raquo: false,
      multiplication: false,
      superscriptTwo: false,
      superscriptThree: false,
      oneQuarter: false,
      threeQuarters: false,
    }),
    EditorEmoji,
    CharacterCount.configure({
      textCounter: countCharacters,
      wordCounter: countWords,
    }),
    TextStyle,
    Color,
    BackgroundColor,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    ...DetailsBlockExtensions,
    CalloutExtension,
    HighlightedCodeBlock.configure({
      defaultLanguage: "text",
      enableTabIndentation: true,
    }),
    TopLevelBlockIdentity,
    ShareAwareImage.configure({
      inline: false,
      allowBase64: false,
      getRuntime: () => ({ workspaceId: undefined, pageId: "", shareToken: undefined }),
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    PageMentionNode,
    ...createTableExtensions(),
  ] as AnyExtension[];
}

function summarizeNode(schema: Schema, name: string) {
  const type = schema.nodes[name];
  expect(type, `${name} node should exist`).toBeDefined();
  return {
    name: type.name,
    attrs: Object.fromEntries(Object.entries(type.spec.attrs ?? {}).map(([attr, spec]) => [attr, spec.default])),
    group: type.spec.group ?? null,
    content: type.spec.content ?? null,
    marks: type.spec.marks ?? null,
    inline: type.spec.inline ?? null,
    atom: type.spec.atom ?? null,
    selectable: type.spec.selectable ?? null,
    draggable: type.spec.draggable ?? null,
    isolating: type.spec.isolating ?? null,
    defining: type.spec.defining ?? null,
    code: type.spec.code ?? null,
  };
}

function summarizeMark(schema: Schema, name: string) {
  const type = schema.marks[name];
  expect(type, `${name} mark should exist`).toBeDefined();
  return {
    name: type.name,
    attrs: Object.fromEntries(Object.entries(type.spec.attrs ?? {}).map(([attr, spec]) => [attr, spec.default])),
    inclusive: type.spec.inclusive ?? null,
    excludes: type.spec.excludes ?? null,
    group: type.spec.group ?? null,
    code: type.spec.code ?? null,
  };
}

function toDomSpec(schema: Schema, content: Record<string, unknown>) {
  const node = schema.nodeFromJSON({ type: "doc", content: [content] }).firstChild;
  expect(node).toBeTruthy();
  return node?.type.spec.toDOM?.(node);
}

function inlineToDomSpec(schema: Schema, content: Record<string, unknown>) {
  const paragraph = schema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content: [content] }],
  }).firstChild;
  const node = paragraph?.firstChild;
  expect(node).toBeTruthy();
  return node?.type.spec.toDOM?.(node);
}

describe("headless editor schema parity", () => {
  const headlessSchema = getSchema(createHeadlessEditorExtensions());
  const clientSchema = getSchema(createClientSchemaExtensions());

  it("keeps custom schema node specs aligned with the client adapters", () => {
    for (const name of CUSTOM_NODE_NAMES) {
      expect(summarizeNode(headlessSchema, name)).toEqual(summarizeNode(clientSchema, name));
    }
  });

  it("keeps shared marks aligned with the client adapters", () => {
    for (const name of MARK_NAMES) {
      expect(summarizeMark(headlessSchema, name)).toEqual(summarizeMark(clientSchema, name));
    }
  });

  it("keeps schema render specs aligned for custom nodes and bid attrs", () => {
    const blockNodes = [
      { type: "paragraph", attrs: { bid: "paragraph-bid" }, content: [{ type: "text", text: "Paragraph" }] },
      { type: "callout", attrs: { bid: "callout-bid", kind: "tip" }, content: [{ type: "paragraph" }] },
      { type: "codeBlock", attrs: { bid: "code-bid", language: "typescript" }, content: [{ type: "text", text: "x" }] },
      { type: "image", attrs: { bid: "image-bid", src: "/uploads/a.png", align: "center", width: 320 } },
      {
        type: "details",
        attrs: { bid: "details-bid", open: true },
        content: [{ type: "detailsSummary" }, { type: "detailsContent", content: [{ type: "paragraph" }] }],
      },
    ];

    for (const node of blockNodes) {
      expect(toDomSpec(headlessSchema, node)).toEqual(toDomSpec(clientSchema, node));
    }

    const mention = { type: "pageMention", attrs: { pageId: "page-1" } };
    expect(inlineToDomSpec(headlessSchema, mention)).toEqual(inlineToDomSpec(clientSchema, mention));
    expect(JSON.stringify(toDomSpec(headlessSchema, blockNodes[0]!))).toContain("data-bid");
  });
});
