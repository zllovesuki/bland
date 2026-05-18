import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SitePageDocument } from "@/sites/server/document";

async function renderSiteDocumentHtml(): Promise<string> {
  const scriptSrc = "/site-assets/sites-entry-test.js";
  const stream = await renderToReadableStream(
    <SitePageDocument
      title="Hello Sites"
      icon="😀"
      coverUrl={null}
      bodyContent={<p>Body</p>}
      metrics={{ words: 1, characters: 4 }}
      description="Body excerpt for search snippets"
      site={{ workspaceName: "bland", workspaceIcon: "🚀", currentIsHome: true, homeHref: "/" }}
      canonicalUrl="https://acme.sites.test/"
      assets={{
        stylesheetHref: "/site-assets/sites-test.css",
        fontStylesheetHref: "/site-assets/fonts-test.css",
        scriptSrc,
        modulePreloadHrefs: ["/site-assets/sites-import-test.js"],
      }}
    />,
    { bootstrapModules: [scriptSrc] },
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
});
