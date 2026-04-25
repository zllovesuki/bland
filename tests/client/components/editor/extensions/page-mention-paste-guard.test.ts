import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Slice } from "@tiptap/pm/model";
import { PageMentionNode } from "@/client/components/editor/extensions/page-mention/node";
import { stripPageMentions } from "@/client/components/editor/extensions/page-mention/node";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), PageMentionNode]);

function paragraphSlice(content: Array<{ type: string; text?: string; attrs?: Record<string, unknown> }>): Slice {
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content }],
  });
  return doc.slice(0, doc.content.size);
}

function collectMentionPageIds(slice: Slice): string[] {
  const ids: string[] = [];
  slice.content.descendants((node) => {
    if (node.type.name === "pageMention") {
      const id = (node.attrs as { pageId?: string }).pageId;
      if (id) ids.push(id);
    }
    return true;
  });
  return ids;
}

describe("stripPageMentions", () => {
  it("drops pageMention nodes and preserves surrounding inline content", () => {
    const slice = paragraphSlice([
      { type: "text", text: "hello " },
      { type: "pageMention", attrs: { pageId: "page-123" } },
      { type: "text", text: " world" },
    ]);

    expect(collectMentionPageIds(slice)).toEqual(["page-123"]);

    const stripped = stripPageMentions(slice);

    expect(collectMentionPageIds(stripped)).toEqual([]);
    expect(stripped.content.firstChild?.textContent).toBe("hello  world");
  });

  it("returns the original slice when no mentions are present", () => {
    const slice = paragraphSlice([{ type: "text", text: "no mentions here" }]);
    expect(stripPageMentions(slice)).toBe(slice);
  });

  it("strips mentions nested inside other inline structures", () => {
    const slice = paragraphSlice([
      { type: "text", text: "outer " },
      { type: "pageMention", attrs: { pageId: "p1" } },
      { type: "text", text: " between " },
      { type: "pageMention", attrs: { pageId: "p2" } },
      { type: "text", text: " end" },
    ]);

    const stripped = stripPageMentions(slice);

    expect(collectMentionPageIds(stripped)).toEqual([]);
    expect(stripped.content.firstChild?.textContent).toBe("outer  between  end");
  });
});
