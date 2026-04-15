import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import {
  codeBlockSnapshotChanged,
  getCodeBlockSnapshot,
} from "@/client/components/editor/extensions/code-block/lazy-highlight";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "text*",
      group: "block",
    },
    codeBlock: {
      attrs: { language: { default: null } },
      code: true,
      content: "text*",
      group: "block",
      marks: "",
    },
    text: { group: "inline" },
  },
});

function paragraph(text: string) {
  return schema.node("paragraph", null, text ? [schema.text(text)] : []);
}

function codeBlock(text: string, language?: string | null) {
  return schema.node("codeBlock", { language: language ?? null }, text ? [schema.text(text)] : []);
}

function doc(...content: ReturnType<typeof paragraph>[]) {
  return schema.node("doc", null, content);
}

describe("lazy code block snapshots", () => {
  it("tracks code block text changes even when non-code selections stay elsewhere", () => {
    const oldDoc = doc(paragraph("Before"), codeBlock("const count = 1", "ts"));
    const newDoc = doc(paragraph("Before"), codeBlock("while (true) {}", "ts"));

    expect(codeBlockSnapshotChanged(oldDoc, newDoc, "codeBlock", "text")).toBe(true);
  });

  it("tracks code block language changes", () => {
    const oldDoc = doc(paragraph("Before"), codeBlock("const count = 1", "text"));
    const newDoc = doc(paragraph("Before"), codeBlock("const count = 1", "ts"));

    expect(codeBlockSnapshotChanged(oldDoc, newDoc, "codeBlock", "text")).toBe(true);
  });

  it("ignores unrelated non-code-block document edits", () => {
    const oldDoc = doc(paragraph("Before"), codeBlock("const count = 1", "ts"));
    const newDoc = doc(paragraph("Before now"), codeBlock("const count = 1", "ts"));

    expect(codeBlockSnapshotChanged(oldDoc, newDoc, "codeBlock", "text")).toBe(false);
  });

  it("normalizes empty languages through the default language", () => {
    const snapshot = getCodeBlockSnapshot(doc(codeBlock("plain text")), "codeBlock", "text");

    expect(snapshot).toEqual(["text\u0000plain text"]);
  });
});
