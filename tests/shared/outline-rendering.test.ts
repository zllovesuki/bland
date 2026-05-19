import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createUniqueOutlineAnchorId,
  normalizeOutlineText,
  OutlinePresentation,
  readOutlineLevel,
  resolveViewportActiveOutlineHeading,
  type OutlineItem,
} from "@/shared/editor/presentation";

describe("shared outline rendering", () => {
  it("normalizes outline text, heading levels, and duplicate-safe anchor ids", () => {
    const used = new Set<string>();

    expect(normalizeOutlineText(" Intro\n\tsection  ")).toBe("Intro section");
    expect(readOutlineLevel(2)).toBe(2);
    expect(readOutlineLevel("3")).toBe(3);
    expect(readOutlineLevel(9)).toBe(1);

    expect(createUniqueOutlineAnchorId("Intro!", used)).toBe("intro");
    expect(createUniqueOutlineAnchorId("Intro", used)).toBe("intro-2");
    expect(createUniqueOutlineAnchorId("你好", used)).toBe("section");
    expect(createUniqueOutlineAnchorId("?!", used)).toBe("section-2");
  });

  it("renders matching button and link outline markup", () => {
    const items: OutlineItem[] = [
      { id: "intro", text: "Intro", level: 1, href: "#intro" },
      { id: "deep", text: "Deep section", level: 3, href: "#custom-deep" },
    ];

    const buttonHtml = renderToStaticMarkup(
      createElement(OutlinePresentation, {
        items,
        activeId: "deep",
        mode: "button",
        title: "On this page",
      }),
    );
    expect(buttonHtml).toContain('class="tiptap-outline"');
    expect(buttonHtml).toContain('aria-label="On this page"');
    expect(buttonHtml).toContain('<button type="button"');
    expect(buttonHtml).toContain('data-outline-id="deep"');
    expect(buttonHtml).toContain('data-active="true"');
    expect(buttonHtml).toContain('aria-current="location"');
    expect(buttonHtml).toContain("padding-inline-start:calc(0.5rem + 1.75rem)");

    const linkHtml = renderToStaticMarkup(
      createElement(OutlinePresentation, {
        items,
        activeId: "intro",
        mode: "link",
        variant: "rail",
      }),
    );
    expect(linkHtml).toContain('class="tiptap-outline tiptap-outline--rail"');
    expect(linkHtml).toContain('<a class="tiptap-outline__button tiptap-outline__link"');
    expect(linkHtml).toContain('href="#custom-deep"');
    expect(linkHtml).toContain('data-outline-id="intro"');
    expect(linkHtml).toContain('data-active="true"');
    expect(linkHtml).toContain('aria-current="location"');
  });

  it("uses the live editor viewport priority rules for active headings", () => {
    expect(
      resolveViewportActiveOutlineHeading(
        [
          { id: "intro", top: -12, bottom: 12 },
          { id: "next", top: 220, bottom: 260 },
        ],
        { top: 0, height: 600 },
      ),
    ).toBe("intro");

    expect(
      resolveViewportActiveOutlineHeading(
        [
          { id: "intro", top: -120, bottom: -20 },
          { id: "next", top: 220, bottom: 260 },
        ],
        { top: 0, height: 600 },
      ),
    ).toBe("next");

    expect(
      resolveViewportActiveOutlineHeading(
        [
          { id: "intro", top: -120, bottom: -20 },
          { id: "next", top: 590, bottom: 640 },
        ],
        { top: 0, height: 600 },
      ),
    ).toBe("intro");
  });
});
