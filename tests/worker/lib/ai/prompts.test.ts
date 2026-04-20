import { describe, expect, it } from "vitest";
import { buildAskMessages, buildGenerateMessages, buildRewriteMessages } from "@/worker/lib/ai/prompts";

describe("buildRewriteMessages", () => {
  it("includes all context pieces when present", () => {
    const messages = buildRewriteMessages({
      action: "proofread",
      selectedText: "hello wrld",
      parentBlock: "hello wrld how are you",
      beforeBlock: "Previous paragraph text",
      afterBlock: "Next paragraph text",
      pageTitle: "My Page",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Proofread the selection");
    expect(messages[0].content).toContain("writing assistant");

    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("Page title: My Page");
    expect(messages[1].content).toContain("Previous block: Previous paragraph text");
    expect(messages[1].content).toContain("Current block: hello wrld how are you");
    expect(messages[1].content).toContain("Next block: Next paragraph text");
    expect(messages[1].content).toContain("Selection to rewrite:\nhello wrld");
  });

  it("omits lines when optional fields are empty", () => {
    const messages = buildRewriteMessages({
      action: "formal",
      selectedText: "the thing",
      parentBlock: "",
      beforeBlock: "",
      afterBlock: "",
      pageTitle: "",
    });
    expect(messages[0].content).toContain("more formal");
    expect(messages[1].content).not.toContain("Page title:");
    expect(messages[1].content).not.toContain("Previous block:");
    expect(messages[1].content).not.toContain("Current block:");
    expect(messages[1].content).not.toContain("Next block:");
    expect(messages[1].content).toContain("Selection to rewrite:\nthe thing");
  });

  it.each(["proofread", "formal", "casual", "simplify", "expand"] as const)(
    "has action-specific instruction for %s",
    (action) => {
      const messages = buildRewriteMessages({
        action,
        selectedText: "x",
        parentBlock: "",
        beforeBlock: "",
        afterBlock: "",
        pageTitle: "",
      });
      expect(messages[0].content.length).toBeGreaterThan(20);
    },
  );
});

describe("buildGenerateMessages", () => {
  it("composes context with continuation instruction", () => {
    const messages = buildGenerateMessages({
      intent: "continue",
      beforeBlock: "Once upon a time",
      afterBlock: "The end.",
      pageTitle: "Story",
    });
    expect(messages[0].content).toContain("Continue writing");
    expect(messages[1].content).toContain("Page title: Story");
    expect(messages[1].content).toContain("Text before the cursor:\nOnce upon a time");
    expect(messages[1].content).toContain("Text after the cursor:\nThe end.");
    expect(messages[1].content).toContain("Write the continuation at the cursor.");
  });

  it("omits context lines when empty", () => {
    const messages = buildGenerateMessages({
      intent: "brainstorm",
      beforeBlock: "",
      afterBlock: "",
      pageTitle: "",
    });
    expect(messages[0].content).toContain("Brainstorm");
    expect(messages[1].content).not.toContain("Page title:");
    expect(messages[1].content).not.toContain("before the cursor:");
    expect(messages[1].content).not.toContain("after the cursor:");
    expect(messages[1].content).toContain("Write the continuation at the cursor.");
  });
});

describe("buildAskMessages", () => {
  it("includes title, context, and full history", () => {
    const messages = buildAskMessages("Doc", "Body content here.", "What is this about?", [
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
    ]);

    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Page title: Doc");
    expect(messages[0].content).toContain("Page content:\nBody content here.");
    expect(messages[0].content).toContain("If the page does not contain the answer");
    expect(messages[1]).toEqual({ role: "user", content: "earlier question" });
    expect(messages[2]).toEqual({ role: "assistant", content: "earlier answer" });
    expect(messages[3]).toEqual({ role: "user", content: "What is this about?" });
  });

  it("marks page content as empty when absent", () => {
    const messages = buildAskMessages("", "", "anything?", []);
    expect(messages[0].content).toContain("Page content is empty.");
    expect(messages[0].content).not.toContain("Page title:");
    expect(messages[1]).toEqual({ role: "user", content: "anything?" });
  });
});
