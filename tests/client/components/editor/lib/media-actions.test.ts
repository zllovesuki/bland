import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { StarterKit } from "@tiptap/starter-kit";
import { NodeSelection } from "@tiptap/pm/state";
import {
  insertImagePlaceholderAtPos,
  insertImagePlaceholderAtRange,
  replaceImageSourceAtTarget,
  resolveImageTargetPos,
  type ImageNodeTarget,
} from "@/client/components/editor/lib/media-actions";

function createEditor(content: Record<string, unknown>) {
  return new Editor({
    extensions: [StarterKit, Image],
    content,
  });
}

describe("image media actions", () => {
  it("inserts an image placeholder and selects it", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "/img" }],
        },
      ],
    });

    try {
      const paragraph = editor.state.doc.firstChild;
      expect(paragraph).not.toBeNull();

      const inserted = insertImagePlaceholderAtRange(editor, { from: 1, to: paragraph!.content.size + 1 });

      expect(inserted).not.toBeNull();
      const pos = resolveImageTargetPos(editor, inserted!.target);

      expect(pos).not.toBeNull();
      expect(editor.state.doc.nodeAt(pos!)?.type.name).toBe("image");
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect(editor.state.selection.from).toBe(pos);
      expect(inserted?.nextPos).toBe((pos ?? 0) + editor.state.doc.nodeAt(pos!)!.nodeSize);
    } finally {
      editor.destroy();
    }
  });

  it("inserts a second placeholder at an explicit position without retargeting the first one", () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "paragraph" }],
    });

    try {
      const first = insertImagePlaceholderAtRange(editor, { from: 1, to: 1 });
      expect(first).not.toBeNull();

      const second = insertImagePlaceholderAtPos(editor, first!.nextPos);
      expect(second).not.toBeNull();

      const firstPos = resolveImageTargetPos(editor, first!.target);
      const secondPos = resolveImageTargetPos(editor, second!.target);

      expect(firstPos).toBe(0);
      expect(secondPos).toBeGreaterThan(firstPos!);
    } finally {
      editor.destroy();
    }
  });

  it("replaces the src for the targeted image node", () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "image", attrs: { src: "" } }],
    });

    try {
      const target: ImageNodeTarget = { pos: 0, dom: null };

      expect(replaceImageSourceAtTarget(editor, target, "/uploads/example")).toBe(true);
      const json = editor.getJSON() as {
        content?: Array<{ attrs?: { src?: string } }>;
      };
      expect(json.content?.[0]?.attrs?.src).toBe("/uploads/example");
    } finally {
      editor.destroy();
    }
  });

  it("fails closed when the target is no longer an image node", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    });

    try {
      const target: ImageNodeTarget = { pos: 0, dom: null };

      expect(replaceImageSourceAtTarget(editor, target, "/uploads/example")).toBe(false);
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    } finally {
      editor.destroy();
    }
  });
});
