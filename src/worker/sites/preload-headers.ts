import type { SiteDocumentAssets } from "@/sites/types";

type PreloadKind = "script" | "style";

function createPreloadLinkHeaderValue(href: string, kind: PreloadKind): string {
  return `<${href}>; rel=preload; as=${kind}`;
}

function withSitesPreloadHeaders(
  headersInit: HeadersInit,
  assets: SiteDocumentAssets,
  scriptHrefs: readonly string[],
): Record<string, string> {
  const headers = new Headers(headersInit);
  const seen = new Set<string>();

  function append(href: string | null | undefined, kind: PreloadKind): void {
    if (!href) return;

    const value = createPreloadLinkHeaderValue(href, kind);
    if (seen.has(value)) return;

    seen.add(value);
    headers.append("Link", value);
  }

  append(assets.stylesheetHref, "style");
  append(assets.fontStylesheetHref, "style");
  for (const href of scriptHrefs) append(href, "script");

  return Object.fromEntries(headers.entries());
}

export function withSitesStaticDocumentPreloadHeaders(
  headersInit: HeadersInit,
  assets: SiteDocumentAssets,
): Record<string, string> {
  return withSitesPreloadHeaders(headersInit, assets, []);
}

export function withSitesPageDocumentPreloadHeaders(
  headersInit: HeadersInit,
  assets: SiteDocumentAssets,
): Record<string, string> {
  return withSitesPreloadHeaders(headersInit, assets, [
    ...(assets.scriptSrc ? [assets.scriptSrc] : []),
    ...assets.modulePreloadHrefs,
  ]);
}
