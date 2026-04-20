import { describe, expect, it } from "vitest";
import { parseAiBlocksFromText, isSingleInlineParagraph, getInlineTextFromParagraph } from "@/client/lib/ai/blocks";

describe("parseAiBlocksFromText", () => {
  it("returns no blocks for empty or whitespace-only input", () => {
    expect(parseAiBlocksFromText("")).toEqual([]);
    expect(parseAiBlocksFromText("   \n  \n")).toEqual([]);
  });

  it("collapses a single paragraph into one inline paragraph", () => {
    const blocks = parseAiBlocksFromText("Hello world.");
    expect(blocks).toHaveLength(1);
    expect(isSingleInlineParagraph(blocks)).toBe(true);
    expect(getInlineTextFromParagraph(blocks[0])).toBe("Hello world.");
  });

  it("joins soft line breaks within a paragraph with spaces", () => {
    const blocks = parseAiBlocksFromText("Line one\nLine two");
    expect(blocks).toHaveLength(1);
    expect(getInlineTextFromParagraph(blocks[0])).toBe("Line one Line two");
  });

  it("splits paragraphs on double newline", () => {
    const blocks = parseAiBlocksFromText("First paragraph.\n\nSecond paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "First paragraph." }] });
    expect(blocks[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Second paragraph." }] });
  });

  it("groups adjacent bullet lines into a bulletList", () => {
    const blocks = parseAiBlocksFromText("- First idea\n- Second idea\n- Third idea");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First idea" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second idea" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Third idea" }] }] },
      ],
    });
  });

  it("accepts asterisk bullet markers", () => {
    const blocks = parseAiBlocksFromText("* alpha\n* beta");
    expect(blocks[0]).toMatchObject({ type: "bulletList" });
    if (blocks[0].type === "bulletList") {
      expect(blocks[0].content).toHaveLength(2);
    }
  });

  it("preserves paragraph + bullet list mix", () => {
    const blocks = parseAiBlocksFromText("Intro sentence.\n\n- one\n- two\n\nOutro sentence.");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    expect(blocks[1]).toMatchObject({ type: "bulletList" });
    expect(blocks[2]).toMatchObject({ type: "paragraph" });
  });

  it("does not treat mixed non-bullet lines as a bullet list", () => {
    const blocks = parseAiBlocksFromText("- not a list\nregular text");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
  });

  it("normalizes CRLF line endings", () => {
    const blocks = parseAiBlocksFromText("First.\r\n\r\nSecond.");
    expect(blocks).toHaveLength(2);
  });
});
