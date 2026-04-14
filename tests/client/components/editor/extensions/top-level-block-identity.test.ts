import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import {
  TopLevelBlockIdentity,
  applyTopLevelBlockIdNormalization,
} from "@/client/components/editor/extensions/top-level-block-identity";
import { createParagraphNode } from "@tests/client/util/editor-fixtures";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), TopLevelBlockIdentity]);

describe("top-level block identity", () => {
  it("assigns compact bids to top-level blocks that are missing them", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [createParagraphNode("One"), createParagraphNode("Two")],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyTopLevelBlockIdNormalization(tr)).toBe(true);
    const json = tr.doc.toJSON() as {
      content: Array<{ attrs?: { bid?: string | null } }>;
    };

    const firstBid = json.content[0]?.attrs?.bid;
    const secondBid = json.content[1]?.attrs?.bid;
    expect(firstBid).toMatch(/^[A-Za-z0-9_-]{6}$/);
    expect(secondBid).toMatch(/^[A-Za-z0-9_-]{6}$/);
    expect(firstBid).not.toBe(secondBid);
  });

  it("repairs duplicate top-level bids and clears nested carried bids", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        createParagraphNode("Top", "dupBid"),
        {
          type: "bulletList",
          attrs: { bid: "listBid" },
          content: [
            {
              type: "listItem",
              content: [createParagraphNode("Nested", "nestedBid")],
            },
          ],
        },
        createParagraphNode("Second top", "dupBid"),
      ],
    });
    const tr = EditorState.create({ schema, doc }).tr;

    expect(applyTopLevelBlockIdNormalization(tr)).toBe(true);
    const json = tr.doc.toJSON() as {
      content: Array<{
        attrs?: { bid?: string | null };
        content?: Array<{ content?: Array<{ attrs?: { bid?: string | null } }> }>;
      }>;
    };

    expect(json.content[0]?.attrs?.bid).toBe("dupBid");
    expect(json.content[1]?.attrs?.bid).toBe("listBid");
    expect(json.content[2]?.attrs?.bid).toMatch(/^[A-Za-z0-9_-]{6}$/);
    expect(json.content[2]?.attrs?.bid).not.toBe("dupBid");
    expect(json.content[1]?.content?.[0]?.content?.[0]?.attrs?.bid).toBeNull();
  });
});
