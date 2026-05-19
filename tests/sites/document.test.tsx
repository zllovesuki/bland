import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SitePageDocument } from "@/sites/document";
import { runWithSitesReactRenderContext } from "@/sites/react-render-context";
import { createTestSitesPageRenderContext } from "./render-context";

async function renderSiteDocumentHtml(): Promise<string> {
  const context = createTestSitesPageRenderContext();
  const stream = await runWithSitesReactRenderContext(context, () =>
    renderToReadableStream(
      <SitePageDocument>
        <p>Body</p>
      </SitePageDocument>,
      {
        bootstrapModules: context.assets.scriptSrc ? [context.assets.scriptSrc] : undefined,
      },
    ),
  );
  return new Response(stream).text();
}

describe("SitePageDocument", () => {
  it("streams one doctype, metadata, emoji attrs, CSS, and body-tail script resources", async () => {
    const html = await renderSiteDocumentHtml();

    expect(html).toMatch(/^<!DOCTYPE html><html/);
    expect(html).not.toContain("<!doctype html><!DOCTYPE html>");
    expect(html).toContain('href="/site-assets/sites-test.css" data-precedence="default"');
    expect(html).toContain('rel="preload" as="style" href="/site-assets/fonts-test.css"');
    expect(html).toContain('rel="stylesheet" href="/site-assets/fonts-test.css"');
    expect(html).toContain('rel="modulepreload"');
    expect(html).toContain('href="/site-assets/sites-import-test.js"');
    expect(html).toContain('src="/site-assets/sites-entry-test.js"');
    expect(html).toContain('name="description" content="Body excerpt for search snippets"');
    expect(html).toContain('property="og:description" content="Body excerpt for search snippets"');
    expect(html).toMatch(
      /<img[^>]+class="site-workspace-mark-img[^"]*"[^>]+loading="lazy"[^>]+decoding="async"[^>]+fetchPriority="low"[^>]+width="20"[^>]+height="20"/,
    );
    expect(html).toMatch(
      /<img[^>]+class="site-icon-img[^"]*"[^>]+loading="lazy"[^>]+decoding="async"[^>]+fetchPriority="low"[^>]+width="28"[^>]+height="28"/,
    );
    expect(html.indexOf('rel="preload" as="style" href="/site-assets/fonts-test.css"')).toBeLessThan(
      html.indexOf("<body"),
    );
    expect(html.lastIndexOf('rel="stylesheet" href="/site-assets/fonts-test.css"')).toBeGreaterThan(
      html.indexOf("</main>"),
    );
    expect(html.indexOf('src="/site-assets/sites-entry-test.js"')).toBeGreaterThan(
      html.lastIndexOf('rel="stylesheet" href="/site-assets/fonts-test.css"'),
    );
  });

  it("throws a clear error when rendered outside the Sites React context", () => {
    expect(() =>
      renderToStaticMarkup(
        <SitePageDocument>
          <p>Body</p>
        </SitePageDocument>,
      ),
    ).toThrow("Sites React render context is required");
  });

  it("keeps page document title and assets isolated across concurrent ALS streams", async () => {
    async function renderIsolated(title: string, stylesheetHref: string) {
      const context = createTestSitesPageRenderContext({
        assets: { stylesheetHref, scriptSrc: null },
        page: { title, canonicalUrl: `https://acme.sites.test/${title.toLowerCase().replaceAll(" ", "-")}` },
      });
      const stream = await runWithSitesReactRenderContext(context, () =>
        renderToReadableStream(
          <SitePageDocument>
            <p>{title}</p>
          </SitePageDocument>,
        ),
      );
      return new Response(stream).text();
    }

    const [first, second] = await Promise.all([
      renderIsolated("First Page", "/site-assets/first.css"),
      renderIsolated("Second Page", "/site-assets/second.css"),
    ]);

    expect(first).toContain("<title>First Page</title>");
    expect(first).toContain('href="/site-assets/first.css"');
    expect(first).not.toContain("Second Page");
    expect(first).not.toContain("/site-assets/second.css");
    expect(second).toContain("<title>Second Page</title>");
    expect(second).toContain('href="/site-assets/second.css"');
    expect(second).not.toContain("First Page");
    expect(second).not.toContain("/site-assets/first.css");
  });
});
