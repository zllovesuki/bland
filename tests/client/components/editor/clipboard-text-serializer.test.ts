import { describe, expect, it } from "vitest";
import { Editor, getTextBetween, getTextSerializersFromSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EDITOR_CORE_EXTENSION_OPTIONS } from "@/client/components/editor/lib/clipboard";

function serializePlainText(content: Record<string, unknown>) {
  const editor = new Editor({
    extensions: [StarterKit],
    content,
    coreExtensionOptions: EDITOR_CORE_EXTENSION_OPTIONS,
  });

  try {
    return getTextBetween(
      editor.state.doc,
      { from: 0, to: editor.state.doc.content.size },
      {
        blockSeparator: EDITOR_CORE_EXTENSION_OPTIONS.clipboardTextSerializer.blockSeparator,
        textSerializers: getTextSerializersFromSchema(editor.schema),
      },
    );
  } finally {
    editor.destroy();
  }
}

describe("plain-text clipboard serialization", () => {
  it("uses single newlines between paragraphs", () => {
    expect(
      serializePlainText({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "one" }] },
          { type: "paragraph", content: [{ type: "text", text: "two" }] },
        ],
      }),
    ).toBe("one\ntwo");
  });

  it("preserves hard breaks as single newlines", () => {
    expect(
      serializePlainText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "one" }, { type: "hardBreak" }, { type: "text", text: "two" }],
          },
          { type: "paragraph", content: [{ type: "text", text: "three" }] },
        ],
      }),
    ).toBe("one\ntwo\nthree");
  });
});
