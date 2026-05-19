import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { runWithSitesReactRenderContext } from "@/sites/react-render-context";
import { renderBlandSitesDocumentToReactElement } from "@/sites/static-renderer";
import { collectSitesOutline } from "@/sites/static-renderer/outline";
import { createTestSitesPageRenderContext, type TestSitesPageRenderContext } from "./render-context";

function render(content: Parameters<typeof renderBlandSitesDocumentToReactElement>[0]): string {
  return renderToStaticMarkup(renderBlandSitesDocumentToReactElement(content));
}

function renderWithSitesContext(
  content: Parameters<typeof renderBlandSitesDocumentToReactElement>[0],
  context: TestSitesPageRenderContext,
): string {
  return runWithSitesReactRenderContext(context, () => render(content));
}

describe("renderBlandSitesDocumentToReactElement", () => {
  it("renders static heading anchors from the collected Sites outline", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, bid: "H1" },
          content: [{ type: "text", text: "Intro" }],
        },
        {
          type: "heading",
          attrs: { level: 2, bid: "H2", textAlign: "center" },
          content: [{ type: "text", text: "Intro" }],
        },
        {
          type: "heading",
          attrs: { level: 3, bid: "EMPTY" },
        },
      ],
    };
    const outline = collectSitesOutline(content);
    const html = renderWithSitesContext(
      content,
      createTestSitesPageRenderContext({ headingAnchorIds: outline.headingAnchorIds }),
    );

    expect(outline.items).toEqual([
      { id: "intro", text: "Intro", level: 1, href: "#intro" },
      { id: "intro-2", text: "Intro", level: 2, href: "#intro-2" },
    ]);
    expect(outline.headingAnchorIds).toEqual(["intro", "intro-2", null]);
    expect(html).toContain('<h1 id="intro" data-bid="H1">Intro</h1>');
    expect(html).toContain('<h2 id="intro-2" data-bid="H2" style="text-align:center">Intro</h2>');
    expect(html).toContain('<h3 data-bid="EMPTY"></h3>');
  });

  it("excludes headings inside closed details while keeping heading id alignment", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, bid: "TOP" },
          content: [{ type: "text", text: "Top" }],
        },
        {
          type: "details",
          attrs: { open: false },
          content: [
            { type: "detailsSummary", content: [{ type: "text", text: "Closed" }] },
            {
              type: "detailsContent",
              content: [
                {
                  type: "heading",
                  attrs: { level: 2, bid: "CLOSED" },
                  content: [{ type: "text", text: "Closed heading" }],
                },
              ],
            },
          ],
        },
        {
          type: "details",
          attrs: { open: true },
          content: [
            { type: "detailsSummary", content: [{ type: "text", text: "Open" }] },
            {
              type: "detailsContent",
              content: [
                {
                  type: "heading",
                  attrs: { level: 2, bid: "OPEN" },
                  content: [{ type: "text", text: "Open heading" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const outline = collectSitesOutline(content);
    const html = renderWithSitesContext(
      content,
      createTestSitesPageRenderContext({ headingAnchorIds: outline.headingAnchorIds }),
    );

    expect(outline.items).toEqual([
      { id: "top", text: "Top", level: 1, href: "#top" },
      { id: "open-heading", text: "Open heading", level: 2, href: "#open-heading" },
    ]);
    expect(outline.headingAnchorIds).toEqual(["top", null, "open-heading"]);
    expect(html).toContain('<h1 id="top" data-bid="TOP">Top</h1>');
    expect(html).toContain('<h2 data-bid="CLOSED">Closed heading</h2>');
    expect(html).toContain('<h2 id="open-heading" data-bid="OPEN">Open heading</h2>');
  });

  it("emits a trailing <br> for empty paragraphs so they preserve block rhythm", () => {
    const html = render({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "before" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "after" }] },
      ],
    });
    expect(html).toContain("<p><br/></p>");
    expect(html).toContain(">before<");
    expect(html).toContain(">after<");
  });

  it("renders task list checkboxes as disabled controls with the saved checked state", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "taskList",
          attrs: { bid: "TASKS" },
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Ship published checkbox" }],
                },
              ],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Keep visitor local" }],
                },
              ],
            },
          ],
        },
      ],
    });
    const checkedInput = findInputByLabel(html, "Task item checkbox for Ship published checkbox, checked");
    const uncheckedInput = findInputByLabel(html, "Task item checkbox for Keep visitor local, unchecked");

    expect(html).toMatch(/<ul(?=[^>]*data-type="taskList")(?=[^>]*data-bid="TASKS")[^>]*>/);
    expect(html).toContain('<li data-type="taskItem" data-checked="true">');
    expect(html).toContain('<li data-type="taskItem" data-checked="false">');
    expect(html).toContain(">Ship published checkbox<");
    expect(html).toContain(">Keep visitor local<");
    expect(checkedInput).toContain('type="checkbox"');
    expect(checkedInput).toMatch(/\schecked(?:=""|(?=\s|>))/);
    expect(checkedInput).toMatch(/\sdisabled(?:=""|(?=\s|>))/);
    expect(uncheckedInput).toContain('type="checkbox"');
    expect(uncheckedInput).not.toMatch(/\schecked(?:=""|(?=\s|>))/);
    expect(uncheckedInput).toMatch(/\sdisabled(?:=""|(?=\s|>))/);
  });

  it("renders emoji nodes through the shared schema's renderHTML so the <img> chain matches the live editor", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "emoji", attrs: { name: "smile" } }],
        },
      ],
    });
    expect(html).toContain('class="tiptap-emoji"');
    expect(html).toContain('data-type="emoji"');
    expect(html).toContain('data-name="smile"');
    expect(html).toMatch(/<img[^>]+src="https:\/\/cdn\.jsdelivr\.net\/[^"]+emoji-datasource-apple[^"]+\.png"/);
  });

  it("falls back to the shortcode literal when the schema does not recognize the emoji name", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "emoji", attrs: { name: "made_up_emoji" } }],
        },
      ],
    });
    expect(html).not.toContain("emoji-datasource-apple");
    expect(html).toContain(":made_up_emoji:");
  });

  it("emits a native <details> element with summary + content for the details block", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "details",
          attrs: { open: true, bid: "D1" },
          content: [
            {
              type: "detailsSummary",
              content: [{ type: "text", text: "Notes" }],
            },
            {
              type: "detailsContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "body" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(html).toContain('<details class="tiptap-details" data-bid="D1" open');
    expect(html).toContain('class="tiptap-details-summary"');
    expect(html).toContain('data-placeholder="Summary"');
    expect(html).toContain(">Notes<");
    expect(html).toContain('class="tiptap-details-content" data-type="detailsContent"');
    expect(html).toContain(">body<");
  });

  it("renders a closed details element without the open attribute", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "details",
          attrs: { open: false },
          content: [
            { type: "detailsSummary", content: [{ type: "text", text: "Title" }] },
            { type: "detailsContent", content: [{ type: "paragraph" }] },
          ],
        },
      ],
    });
    expect(html).toContain('<details class="tiptap-details">');
    expect(html).not.toContain('open=""');
    expect(html).not.toContain("open>");
  });

  it("uses escaped CSS content for details chevrons so Sites CSS does not depend on charset inference", () => {
    const css = readFileSync(new URL("../../src/styles/editor/details.css", import.meta.url), "utf8");
    expect(css.match(/content: "\\25B8";/g)).toHaveLength(2);
  });

  it("marks static callout kind chrome as read-only", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { kind: "info", bid: "C1" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "that should work" }],
            },
          ],
        },
      ],
    });
    expect(html).toContain('class="tiptap-callout"');
    expect(html).toContain('data-callout-kind="info"');
    expect(html).toContain('data-bid="C1"');
    expect(html).toContain('class="tiptap-callout-kind-btn"');
    expect(html).toContain('data-read-only=""');
  });

  it("renders static code blocks with syntax highlighting, copy island, and language chip", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { bid: "CODE1", language: "ts" },
          content: [{ type: "text", text: "const answer: number = 42;" }],
        },
      ],
    });

    expect(html).toContain('class="tiptap-code-block-wrapper"');
    expect(html).toContain('data-language="typescript"');
    expect(html).toContain('data-bid="CODE1"');
    expect(html).toContain('data-island="copy-code"');
    expect(html).toContain('class="tiptap-code-block-copy-btn"');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('aria-label="Language: TypeScript"');
    expect(html).toContain(">TypeScript<");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain(">const<");
    expect(html).toContain("hljs-number");
    expect(html).toContain(">42<");
    // The legacy event-delegation hook is replaced by the island marker.
    expect(html).not.toContain("data-sites-copy-code");
  });

  it("does NOT expose pageId when the page mention attr is null (restricted via pre-walk)", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "pageMention",
              attrs: { pageId: null },
            },
          ],
        },
      ],
    });
    expect(html).not.toContain("data-page-id=");
    expect(html).toContain("Restricted");
  });

  it("emits an accessible <a> mention when the resolver returns an href", () => {
    const html = renderWithSitesContext(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "pageMention",
                attrs: { pageId: "01ABC" },
              },
            ],
          },
        ],
      },
      createTestSitesPageRenderContext({
        resolvePageMention: () => ({
          label: "Welcome",
          href: "/welcome-01ABC",
          kind: "accessible",
        }),
      }),
    );
    expect(html).toContain('<a class="tiptap-page-mention" data-page-id="01ABC"');
    expect(html).toContain('href="/welcome-01ABC"');
    expect(html).toContain(">Welcome<");
  });

  it("keeps heading anchors and page mentions isolated across concurrent ALS renders", async () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [{ type: "pageMention", attrs: { pageId: "PAGE" } }],
        },
      ],
    };

    async function renderIsolated(anchorId: string, label: string) {
      return runWithSitesReactRenderContext(
        createTestSitesPageRenderContext({
          headingAnchorIds: [anchorId],
          resolvePageMention: () => ({ label, href: `/${label.toLowerCase()}`, kind: "accessible" }),
        }),
        async () => {
          await Promise.resolve();
          return render(content);
        },
      );
    }

    const [first, second] = await Promise.all([
      renderIsolated("first-heading", "First"),
      renderIsolated("second-heading", "Second"),
    ]);

    expect(first).toContain('<h1 id="first-heading">Title</h1>');
    expect(first).toContain(">First<");
    expect(first).not.toContain("second-heading");
    expect(first).not.toContain(">Second<");
    expect(second).toContain('<h1 id="second-heading">Title</h1>');
    expect(second).toContain(">Second<");
    expect(second).not.toContain("first-heading");
    expect(second).not.toContain(">First<");
  });
});

function findInputByLabel(html: string, label: string): string {
  const match = html.match(new RegExp(`<input[^>]+aria-label="${escapeRegExp(label)}"[^>]*>`));
  expect(match, `expected input with aria-label "${label}"`).not.toBeNull();
  return match?.[0] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
