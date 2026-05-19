import { describe, expect, it } from "vitest";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { runWithSitesReactRenderContext } from "@/sites/react-render-context";
import { renderBlandSitesDocumentToReactElement } from "@/sites/static-renderer";
import { createTestSitesPageRenderContext } from "./render-context";

const CONTENT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { bid: "intro-bid" },
      content: [{ type: "text", text: "Intro" }],
    },
    {
      type: "callout",
      attrs: { bid: "callout-bid", kind: "warning" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "Check this" }] }],
    },
    {
      type: "codeBlock",
      attrs: { bid: "code-bid", language: "ts" },
      content: [{ type: "text", text: "const answer = 42" }],
    },
    {
      type: "image",
      attrs: {
        bid: "image-bid",
        src: "/uploads/example.png",
        alt: "Example image",
        title: null,
        align: "center",
        width: 480,
        naturalWidth: 1280,
        naturalHeight: 720,
        pendingInsertId: "pending-1",
      },
    },
    {
      type: "paragraph",
      attrs: { bid: "mention-bid" },
      content: [
        { type: "text", text: "See " },
        { type: "pageMention", attrs: { pageId: "page-roadmap" } },
      ],
    },
  ],
};

function renderElement() {
  return runWithSitesReactRenderContext(
    createTestSitesPageRenderContext({
      resolvePageMention: (pageId) =>
        pageId === "page-roadmap"
          ? { label: "Roadmap", href: "/sites/roadmap", ariaLabel: "Roadmap page" }
          : { label: "Restricted", href: null, kind: "restricted" },
    }),
    () => renderBlandSitesDocumentToReactElement(CONTENT),
  );
}

describe("Bland Sites static renderer prep", () => {
  it("renders Tiptap JSON to static markup through explicit custom node mappings", () => {
    const html = renderToStaticMarkup(renderElement());

    expect(html).toContain('data-bid="intro-bid"');
    expect(html).toContain('data-bid="callout-bid"');
    expect(html).toContain('data-callout-kind="warning"');
    expect(html).toContain("Check this");
    expect(html).toContain('data-bid="code-bid"');
    expect(html).toContain('data-language="typescript"');
    expect(html).toContain("hljs-keyword");
    expect(html).toContain(">const<");
    expect(html).toContain("answer");
    expect(html).toContain('data-bid="image-bid"');
    expect(html).toContain('src="/uploads/example.png"');
    expect(html).toContain("Example image");
    expect(html).toContain('href="/sites/roadmap"');
    expect(html).toContain("Roadmap");
  });

  it("filters internal and null image attrs from rendered image HTML attributes", () => {
    const html = renderToStaticMarkup(renderElement());

    // naturalWidth/naturalHeight appear inside the sites-image island prop
    // payload (a <template> body) so the client hydration can reserve aspect
    // ratio. Neither should leak as an HTML attribute on the <img>.
    expect(html).not.toMatch(/<img[^>]*\bnaturalWidth=/);
    expect(html).not.toMatch(/<img[^>]*\bnaturalHeight=/);
    expect(html).not.toContain("pendingInsertId");
    expect(html).not.toContain('title="null"');
  });

  it("can stream the same React element for future Sites responses", async () => {
    const stream = await renderToReadableStream(renderElement());
    const html = await new Response(stream).text();

    expect(html).toContain("Intro");
    expect(html).toContain("Roadmap");
  });
});
