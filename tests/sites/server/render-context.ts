import type { SitesReactRenderContext } from "@/sites/server/react-render-context";

export type TestSitesPageRenderContext = Extract<SitesReactRenderContext, { kind: "page" }>;

type TestSitesPageRenderContextOverrides = Omit<Partial<TestSitesPageRenderContext>, "assets" | "kind" | "page"> & {
  assets?: Partial<TestSitesPageRenderContext["assets"]>;
  page?: Partial<TestSitesPageRenderContext["page"]>;
};

export const TEST_SITE_DOCUMENT_ASSETS: TestSitesPageRenderContext["assets"] = {
  stylesheetHref: "/site-assets/sites-test.css",
  fontStylesheetHref: "/site-assets/fonts-test.css",
  scriptSrc: "/site-assets/sites-entry-test.js",
  modulePreloadHrefs: ["/site-assets/sites-import-test.js"],
};

export function createTestSitesPageRenderContext(
  overrides: TestSitesPageRenderContextOverrides = {},
): TestSitesPageRenderContext {
  const context: TestSitesPageRenderContext = {
    kind: "page",
    assets: TEST_SITE_DOCUMENT_ASSETS,
    headingAnchorIds: [],
    resolvePageMention: () => ({ label: "Restricted", href: null, kind: "restricted" }),
    page: {
      title: "Hello Sites",
      icon: "😀",
      coverUrl: null,
      outline: [],
      metrics: { words: 1, characters: 4 },
      description: "Body excerpt for search snippets",
      canonicalUrl: "https://acme.sites.test/",
      site: {
        workspaceName: "bland",
        workspaceIcon: "🚀",
        currentIsHome: true,
        homeHref: "/",
      },
    },
  };

  return {
    ...context,
    ...overrides,
    kind: "page",
    assets: { ...context.assets, ...overrides.assets },
    page: { ...context.page, ...overrides.page },
  };
}
