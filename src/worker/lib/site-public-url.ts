import { slugify } from "@/lib/slugify";

export interface PublicUrlSiteRow {
  slug: string;
  published_at: string | null;
  home_page_id: string | null;
}

function isLocalSitesDomain(baseDomain: string): boolean {
  return baseDomain === "localhost" || baseDomain.endsWith(".localhost");
}

/**
 * Construct the public URL that a viewer should land on for a published page.
 *
 * Production domains are real hostnames served over HTTPS without a port.
 * Local dev (e.g. `PUBLISHED_SITE_DOMAIN=bland.localhost`) derives the
 * protocol and port from the request so that URLs copied out of the dialog
 * point at the running Vite dev server rather than `https://...localhost/`.
 */
export function buildSitePublicUrl(
  site: PublicUrlSiteRow,
  baseDomain: string | null,
  pageId: string,
  pageTitle: string,
  requestUrl: URL,
): string | null {
  if (!site.published_at || !baseDomain) return null;
  const local = isLocalSitesDomain(baseDomain);
  const protocol = local ? requestUrl.protocol : "https:";
  const port = local && requestUrl.port ? `:${requestUrl.port}` : "";
  const origin = `${protocol}//${site.slug}.${baseDomain}${port}`;
  if (site.home_page_id === pageId) return `${origin}/`;
  return `${origin}${buildSitePagePath(pageId, pageTitle)}`;
}

export function buildSitePagePath(pageId: string, pageTitle: string): string {
  const slugPart = slugify(pageTitle) || "untitled";
  return `/${slugPart}-${pageId.toLowerCase()}`;
}
