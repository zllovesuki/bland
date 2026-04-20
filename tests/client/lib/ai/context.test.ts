import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { extractDocumentTitle, extractGenerateContext, extractRewriteContext } from "@/client/lib/ai/context";

const schema = getSchema([StarterKit.configure({ undoRedo: false })]);

function stateFromDoc(doc: Parameters<typeof schema.nodeFromJSON>[0], from?: number, to?: number): EditorState {
  const pmDoc = schema.nodeFromJSON(doc);
  const state = EditorState.create({ schema, doc: pmDoc });
  if (typeof from !== "number") return state;
  const resolvedFrom = state.doc.resolve(from);
  const resolvedTo = state.doc.resolve(to ?? from);
  return state.apply(state.tr.setSelection(new TextSelection(resolvedFrom, resolvedTo)));
}

describe("extractRewriteContext", () => {
  it("captures selected text, parent block, and both siblings for a middle paragraph", () => {
    const state = stateFromDoc(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Intro paragraph." }] },
          { type: "paragraph", content: [{ type: "text", text: "Middle paragraph text." }] },
          { type: "paragraph", content: [{ type: "text", text: "Closing paragraph." }] },
        ],
      },
      19,
      26,
    );

    const ctx = extractRewriteContext(state);
    expect(ctx.selectedText).toBe("Middle ");
    expect(ctx.parentBlock).toBe("Middle paragraph text.");
    expect(ctx.beforeBlock).toBe("Intro paragraph.");
    expect(ctx.afterBlock).toBe("Closing paragraph.");
  });

  it("returns empty siblings at document edges", () => {
    const state = stateFromDoc(
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Only paragraph." }] }],
      },
      1,
      5,
    );

    const ctx = extractRewriteContext(state);
    expect(ctx.selectedText).toBe("Only");
    expect(ctx.parentBlock).toBe("Only paragraph.");
    expect(ctx.beforeBlock).toBe("");
    expect(ctx.afterBlock).toBe("");
  });
});

describe("extractGenerateContext", () => {
  it("includes the current block in beforeBlock when the cursor is mid-text", () => {
    const state = stateFromDoc(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First thought." }] },
          { type: "paragraph", content: [{ type: "text", text: "Second thought." }] },
        ],
      },
      18,
    );

    const ctx = extractGenerateContext(state, 18);
    expect(ctx.beforeBlock).toContain("First thought.");
    expect(ctx.beforeBlock).toContain("Second thought.");
    expect(ctx.afterBlock).toBe("");
  });

  it("uses prev/next blocks when the cursor lands in an empty paragraph", () => {
    const state = stateFromDoc(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Head." }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Tail." }] },
        ],
      },
      8,
    );

    const ctx = extractGenerateContext(state, 8);
    expect(ctx.beforeBlock).toBe("Head.");
    expect(ctx.afterBlock).toBe("Tail.");
  });

  it("walks past multiple empty blocks on either side", () => {
    const state = stateFromDoc(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Anchor before." }] },
          { type: "paragraph" },
          { type: "paragraph" },
          { type: "paragraph" },
          { type: "paragraph" },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Anchor after." }] },
        ],
      },
      12,
    );

    const ctx = extractGenerateContext(state, 12);
    expect(ctx.beforeBlock).toBe("Anchor before.");
    expect(ctx.afterBlock).toBe("Anchor after.");
  });

  it("returns empty context when surrounded only by empty blocks within walk limit", () => {
    const state = stateFromDoc(
      {
        type: "doc",
        content: Array.from({ length: 5 }, () => ({ type: "paragraph" })),
      },
      2,
    );

    const ctx = extractGenerateContext(state, 2);
    expect(ctx.beforeBlock).toBe("");
    expect(ctx.afterBlock).toBe("");
  });
});

describe("extractDocumentTitle", () => {
  it("returns the first h1 text", () => {
    const state = stateFromDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hello World" }] },
        { type: "paragraph", content: [{ type: "text", text: "body" }] },
      ],
    });
    expect(extractDocumentTitle(state.doc)).toBe("Hello World");
  });

  it("returns empty string when there is no h1", () => {
    const state = stateFromDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sub" }] },
        { type: "paragraph", content: [{ type: "text", text: "body" }] },
      ],
    });
    expect(extractDocumentTitle(state.doc)).toBe("");
  });

  it("returns empty string for an empty document", () => {
    const state = stateFromDoc({ type: "doc", content: [{ type: "paragraph" }] });
    expect(extractDocumentTitle(state.doc)).toBe("");
  });

  it("skips an empty h1 and uses the next one", () => {
    const state = stateFromDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Real Title" }] },
      ],
    });
    expect(extractDocumentTitle(state.doc)).toBe("Real Title");
  });

  it("returns the first h1 when multiple exist", () => {
    const state = stateFromDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "First" }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Second" }] },
      ],
    });
    expect(extractDocumentTitle(state.doc)).toBe("First");
  });
});

describe("extractRewriteContext across empty siblings", () => {
  it("skips adjacent empty paragraphs to find before/after context", () => {
    const state = stateFromDoc(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First." }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Middle." }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "Last." }] },
        ],
      },
      12,
      19,
    );

    const ctx = extractRewriteContext(state);
    expect(ctx.parentBlock).toBe("Middle.");
    expect(ctx.beforeBlock).toBe("First.");
    expect(ctx.afterBlock).toBe("Last.");
  });
});
