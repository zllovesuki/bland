import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { collectEditorTextMetrics, createHeadlessEditorExtensions } from "@/shared/editor/schema";

const schema = getSchema(createHeadlessEditorExtensions());

function metricsFor(content: JSONContent) {
  return collectEditorTextMetrics(schema.nodeFromJSON(content));
}

describe("shared editor metrics", () => {
  it("matches Tiptap CharacterCount text extraction for block text", () => {
    expect(
      metricsFor({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
          { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
          { type: "codeBlock", content: [{ type: "text", text: "const answer = 42" }] },
        ],
      }),
    ).toEqual({ words: 8, characters: 39 });
  });

  it("counts atom nodes as character placeholders without adding words", () => {
    expect(
      metricsFor({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "See " },
              { type: "pageMention", attrs: { pageId: "page-roadmap" } },
              { type: "text", text: " soon" },
            ],
          },
          {
            type: "image",
            attrs: {
              src: "/uploads/example.png",
              alt: "Example",
              title: null,
              align: "center",
              width: 480,
              naturalWidth: null,
              naturalHeight: null,
              pendingInsertId: null,
            },
          },
        ],
      }),
    ).toEqual({ words: 2, characters: 11 });
  });

  it("returns zero metrics for empty documents", () => {
    expect(metricsFor({ type: "doc", content: [{ type: "paragraph" }] })).toEqual({ words: 0, characters: 0 });
  });
});
