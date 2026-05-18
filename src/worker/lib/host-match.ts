export type SiteHostMatch =
  | { kind: "subdomain"; slug: string; baseDomain: string }
  | { kind: "apex"; baseDomain: string }
  | { kind: "none" };

export function matchSiteHost(url: URL, env: Pick<Env, "PUBLISHED_SITE_DOMAIN">): SiteHostMatch {
  const baseDomain = env.PUBLISHED_SITE_DOMAIN?.trim().toLowerCase();
  if (!baseDomain) return { kind: "none" };

  const host = url.hostname.toLowerCase();
  if (host === baseDomain) return { kind: "apex", baseDomain };

  const suffix = "." + baseDomain;
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, host.length - suffix.length);
    // Reject multi-label subdomains (e.g. foo.bar.bland.site). Sites carve out
    // exactly one label under the base domain in v1.
    if (slug.length > 0 && !slug.includes(".")) {
      return { kind: "subdomain", slug, baseDomain };
    }
  }

  return { kind: "none" };
}
