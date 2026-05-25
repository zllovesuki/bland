import { expect } from "vitest";

import { handlePageProjection } from "@/worker/queues/page-projection";

function expectSitesPreloadLinks(response: Response, expectsScripts: boolean): void {
  const link = response.headers.get("Link") ?? "";
  expect(link).toContain("</site-assets/sites-test.css>; rel=preload; as=style");
  expect(link).toContain("</site-assets/fonts-test.css>; rel=preload; as=style");

  if (expectsScripts) {
    expect(link).toContain("</site-assets/sites-entry-test.js>; rel=preload; as=script");
    expect(link).toContain("</site-assets/outline-model-test.js>; rel=preload; as=script");
  } else {
    expect(link).not.toContain("</site-assets/sites-entry-test.js>; rel=preload; as=script");
    expect(link).not.toContain("</site-assets/outline-model-test.js>; rel=preload; as=script");
  }
}

export function expectSitesStaticDocumentPreloadLinks(response: Response): void {
  expectSitesPreloadLinks(response, false);
}

export function expectSitesPageDocumentPreloadLinks(response: Response): void {
  expectSitesPreloadLinks(response, true);
}

export async function projectSitePage(env: Env, pageId: string): Promise<void> {
  const result = await handlePageProjection(pageId, env);
  expect(result).toEqual({ kind: "ok" });
}
