import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { createCalloutNode, type CalloutBlockAttrs } from "@/client/components/editor/controllers/callout";
import { CalloutExtension } from "@/client/components/editor/extensions/callout";
import {
  CALLOUT_KINDS,
  DEFAULT_CALLOUT_KIND,
  normalizeCalloutKind,
} from "@/client/components/editor/extensions/callout/kinds";

const schema = getSchema([StarterKit.configure({ undoRedo: false }), CalloutExtension]);

describe("callout block helpers", () => {
  it("defaults to info kind with a single empty paragraph", () => {
    expect(createCalloutNode()).toEqual({
      type: "callout",
      attrs: { kind: "info" },
      content: [{ type: "paragraph" }],
    });
  });

  it("honors an explicit supported kind", () => {
    expect(createCalloutNode({ kind: "warning" })).toEqual({
      type: "callout",
      attrs: { kind: "warning" },
      content: [{ type: "paragraph" }],
    });
  });

  it("falls back to the default kind when given an unknown kind", () => {
    const attrs = { kind: "bogus" } as unknown as CalloutBlockAttrs;
    expect(createCalloutNode(attrs)).toEqual({
      type: "callout",
      attrs: { kind: DEFAULT_CALLOUT_KIND },
      content: [{ type: "paragraph" }],
    });
  });

  it("exposes every supported kind through normalizeCalloutKind", () => {
    for (const kind of CALLOUT_KINDS) {
      expect(normalizeCalloutKind(kind)).toBe(kind);
    }
    expect(normalizeCalloutKind(null)).toBe(DEFAULT_CALLOUT_KIND);
    expect(normalizeCalloutKind(undefined)).toBe(DEFAULT_CALLOUT_KIND);
    expect(normalizeCalloutKind("nope")).toBe(DEFAULT_CALLOUT_KIND);
    expect(normalizeCalloutKind(42)).toBe(DEFAULT_CALLOUT_KIND);
  });

  it("round-trips through the editor schema without losing content", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        createCalloutNode({ kind: "tip" }),
        {
          type: "callout",
          attrs: { kind: "warning" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Hello inside a callout" }] },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "nested list item" }] }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(doc.childCount).toBe(2);
    expect(doc.firstChild?.type.name).toBe("callout");
    expect(doc.firstChild?.attrs.kind).toBe("tip");
    const second = doc.child(1);
    expect(second.attrs.kind).toBe("warning");
    expect(second.childCount).toBe(2);
    expect(second.textContent).toContain("Hello inside a callout");
    expect(second.textContent).toContain("nested list item");
  });
});
