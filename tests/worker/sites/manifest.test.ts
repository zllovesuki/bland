import { beforeEach, describe, expect, it, vi } from "vitest";

import { SITES_BROWSER_ENTRY, SITES_FONTS_SOURCE, SITES_STYLES_SOURCE } from "@/shared/sites/entrypoints";
import { resetSitesManifestCacheForTests, resolveSitesDocumentAssets } from "@/worker/sites/manifest";

function createMissingAssetsEnv(): Pick<Env, "ASSETS"> {
  return {
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    } as unknown as Fetcher,
  };
}

describe("resolveSitesDocumentAssets", () => {
  beforeEach(() => {
    resetSitesManifestCacheForTests();
  });

  it("uses Vite source paths in dev builds when the built manifest is absent", async () => {
    const assets = await resolveSitesDocumentAssets(createMissingAssetsEnv());

    expect(assets).toEqual({
      stylesheetHref: `/${SITES_STYLES_SOURCE}?direct`,
      fontStylesheetHref: `/${SITES_FONTS_SOURCE}?direct`,
      scriptSrc: `/${SITES_BROWSER_ENTRY}`,
      modulePreloadHrefs: [],
    });
  });
});
