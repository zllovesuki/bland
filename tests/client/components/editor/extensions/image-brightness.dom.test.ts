import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { DOMParser, DOMSerializer } from "@tiptap/pm/model";
import { createHeadlessEditorExtensions } from "@/shared/editor/schema";

const schema = getSchema(createHeadlessEditorExtensions());

describe("image brightness HTML round-trip", () => {
  it("preserves brightness, source, and caption through HTML", () => {
    const image = schema.nodes.image!.create({ src: "/uploads/screenshot", alt: "Screenshot", brightness: 75 });
    const container = document.createElement("div");
    container.append(DOMSerializer.fromSchema(schema).serializeNode(image));
    const rendered = container.querySelector("img")!;

    expect(rendered.dataset.brightness).toBe("75");
    expect(rendered.style.filter).toBe("brightness(0.75)");
    expect(DOMParser.fromSchema(schema).parse(container).firstChild?.attrs).toMatchObject({
      src: "/uploads/screenshot",
      alt: "Screenshot",
      brightness: 75,
    });
  });

  it("keeps older images at normal brightness and bounds imported values", () => {
    for (const [attribute, brightness] of [
      ["", 100],
      ['data-brightness="bad"', 100],
      ['data-brightness="0"', 25],
      ['data-brightness="200"', 100],
    ] as const) {
      const container = document.createElement("div");
      container.innerHTML = `<img src="/uploads/screenshot" ${attribute}>`;
      expect(DOMParser.fromSchema(schema).parse(container).firstChild?.attrs.brightness).toBe(brightness);
    }
    const container = document.createElement("div");
    container.append(
      DOMSerializer.fromSchema(schema).serializeNode(schema.nodes.image!.create({ src: "/uploads/old" })),
    );
    expect(container.querySelector("img")?.style.filter).toBe("");
    expect(container.querySelector("img")?.hasAttribute("data-brightness")).toBe(false);
  });
});
