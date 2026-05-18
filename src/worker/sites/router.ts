import { Hono, type Context } from "hono";
import { setMetric, timing, wrapTime } from "hono/timing";

import { createSessionDb, type Db } from "@/worker/db/d1/client";
import { matchSiteHost, type SiteHostMatch } from "@/worker/lib/host-match";
import {
  isSitesFeatureEnabled,
  resolvePublishedSitePage,
  type ResolvedPublishedPage,
  type ResolvedPublishedSitePage,
  type ResolvedSite,
} from "@/worker/lib/published-pages";
import { buildSitePagePath } from "@/worker/lib/site-public-url";
import { applySitesSecurityHeaders } from "@/worker/lib/security-headers";
import { serveSiteAsset } from "@/worker/sites/assets";
import {
  buildSiteCacheKey,
  buildSiteHtmlEtag,
  createSiteHtmlRevision,
  getSitesCache,
  getSitesRendererVersion,
  siteHtmlEtagMatches,
} from "@/worker/sites/cache";
import { loadPagePmJson } from "@/worker/sites/load-page-pm-json";
import { prepareSitePageRender } from "@/worker/sites/prepare-page-render";
import { renderSitePageDocumentStream } from "@/worker/sites/render-page-stream";
import { resolveSitesDocumentAssets } from "@/worker/sites/manifest";
import { renderApexDocumentHtml, renderRobotsTxt, renderSiteNotFoundDocumentHtml } from "@/sites/server/document";
import type { SiteDocumentAssets } from "@/sites/server/document";

const PAGE_ID_LENGTH = 26;
const PAGE_SEGMENT_ROUTE =
  "/:pageSegment{[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?-[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}}";
const ASSET_ROUTE = "/_assets/:pageId{[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}}/:uploadId{[A-Za-z0-9_-]+}";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=0, must-revalidate",
};
const INTERNAL_HTML_CACHE_CONTROL = "public, max-age=300, must-revalidate";

type MatchedSiteHost = Extract<SiteHostMatch, { kind: "apex" | "subdomain" }>;

type SitesVariables = {
  db: Db;
  siteHost: MatchedSiteHost;
};

type SitesContext = { Bindings: Env; Variables: SitesVariables };

export const sitesApp = new Hono<SitesContext>();

sitesApp.use("*", timing());

sitesApp.use("*", async (c, next) => {
  await next();
  c.res = applySitesSecurityHeaders(c.res, c.req.url);
});

sitesApp.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return methodNotAllowed(c);
  }
  await next();
});

sitesApp.use("*", async (c, next) => {
  const match = matchSiteHost(new URL(c.req.url), c.env);
  if (!isSitesFeatureEnabled(c.env) || match.kind === "none") {
    return siteNotFound(c);
  }

  c.set("siteHost", match);

  if (c.req.path === "/robots.txt" || match.kind === "apex") {
    await next();
    return;
  }

  const { db } = createSessionDb(c.env.DB, "first-unconstrained");
  c.set("db", db);

  await next();
});

sitesApp.get("/robots.txt", (c) => {
  return c.text(renderRobotsTxt(), 200, { "Content-Type": "text/plain; charset=utf-8" });
});

sitesApp.get("/", async (c) => {
  const match = c.get("siteHost");
  if (match.kind === "apex") {
    const assets = await resolveRequiredSitesDocumentAssets(c);
    if (!assets) return sitesAssetsUnavailable(c);
    return c.html(renderApexDocumentHtml({ assets }), 200, HTML_HEADERS);
  }

  const resolved = await resolveCurrentSitePage(c, null);
  if (!resolved) return siteNotFound(c);
  if (!resolved.page) return siteNotFound(c, resolved.site);
  return servePage(c, resolved.site, resolved.page, { isHome: true });
});

sitesApp.get(ASSET_ROUTE, async (c) => {
  const match = c.get("siteHost");
  if (match.kind === "apex") return siteNotFound(c);

  const resolved = await resolveCurrentSitePage(c, c.req.param("pageId").toUpperCase());
  if (!resolved) return siteNotFound(c);
  if (!resolved.page) return siteNotFound(c, resolved.site);

  return serveSiteAsset({
    env: c.env,
    db: c.get("db"),
    site: resolved.site,
    page: resolved.page,
    uploadId: c.req.param("uploadId"),
  });
});

sitesApp.get(PAGE_SEGMENT_ROUTE, async (c) => {
  const match = c.get("siteHost");
  if (match.kind === "apex") return siteNotFound(c);

  const pageSegment = c.req.param("pageSegment");
  const pageId = pageSegment.slice(-PAGE_ID_LENGTH).toUpperCase();
  const resolved = await resolveCurrentSitePage(c, pageId);
  if (!resolved) return siteNotFound(c);
  if (!resolved.page) return siteNotFound(c, resolved.site);
  return servePage(c, resolved.site, resolved.page, { isHome: false, requestedPath: c.req.path });
});

sitesApp.get("*", async (c) => {
  const match = c.get("siteHost");
  if (match.kind !== "subdomain") return siteNotFound(c);

  const resolved = await resolveCurrentSitePage(c, null);
  return siteNotFound(c, resolved?.site ?? null);
});

sitesApp.notFound((c) => siteNotFound(c));

interface ServePageOptions {
  isHome: boolean;
  requestedPath?: string;
}

async function resolveCurrentSitePage(
  c: Context<SitesContext>,
  requestedPageId: string | null,
): Promise<ResolvedPublishedSitePage | null> {
  const match = c.get("siteHost");
  if (match.kind !== "subdomain") return null;
  return timeSite(c, "site_page_lookup", () =>
    resolvePublishedSitePage(c.get("db"), match.slug, c.req.path, requestedPageId),
  );
}

async function servePage(
  c: Context<SitesContext>,
  site: ResolvedSite,
  page: ResolvedPublishedPage,
  opts: ServePageOptions,
): Promise<Response> {
  if (!opts.isHome) {
    if (site.home_page_id === page.id) {
      return redirect(c, "/");
    }
    const canonicalPath = buildSitePagePath(page.id, page.title);
    if (opts.requestedPath && opts.requestedPath !== canonicalPath) {
      return redirect(c, canonicalPath);
    }
  }

  return serveCachedOrRender(c, site, page);
}

async function serveCachedOrRender(
  c: Context<SitesContext>,
  site: ResolvedSite,
  page: ResolvedPublishedPage,
): Promise<Response> {
  const request = c.req.raw;
  const db = c.get("db");
  const rendererVersion = getSitesRendererVersion(c.env);
  const currentIsHome = site.home_page_id === page.id;
  const canonicalPath = currentIsHome ? "/" : buildSitePagePath(page.id, page.title);
  const url = new URL(c.req.url);
  const canonicalUrl = `${url.protocol}//${url.host}${canonicalPath}`;
  const revision = await createSiteHtmlRevision({ rendererVersion, site, page, currentIsHome, canonicalPath });
  const headers = buildHtmlHeaders(site, page, revision);

  if (siteHtmlEtagMatches(request.headers.get("If-None-Match"), headers.ETag)) {
    markSite(c, "cache_read", "skipped_304");
    return c.body(null, 304, headers);
  }

  const cache = await getSitesCache();
  const cacheKey = buildSiteCacheKey(request, revision);

  const cached = await timeSite(c, "cache_read", () => cache.match(cacheKey));
  if (cached?.body) {
    markSite(c, "cache_write", "skipped_hit");
    return c.body(cached.body, 200, headers);
  }

  const pmJson = await loadPagePmJson({ env: c.env, page, timings: (name, operation) => timeSite(c, name, operation) });
  if (!pmJson) return siteNotFound(c, site);
  if (pmJson.writeBack) c.executionCtx.waitUntil(pmJson.writeBack());

  const prepared = await prepareSitePageRender({
    env: c.env,
    db,
    timings: (name, operation) => timeSite(c, name, operation),
    page,
    pmJson,
    currentIsHome,
    canonicalPath,
    canonicalUrl,
  });
  if (!prepared) return sitesAssetsUnavailable(c);

  const stream = await timeSite(c, "render_stream", () =>
    renderSitePageDocumentStream({ env: c.env, db, site, page, prepared }),
  );
  const [responseStream, cacheStream] = stream.tee();

  const cacheResponse = new Response(cacheStream, { status: 200, headers: buildInternalCacheHeaders(headers) });
  markSite(c, "cache_write", "scheduled");
  c.executionCtx.waitUntil(cache.put(cacheKey, cacheResponse));

  return c.body(responseStream, 200, headers);
}

function buildHtmlHeaders(site: ResolvedSite, page: ResolvedPublishedPage, revision: string) {
  return {
    ...HTML_HEADERS,
    ETag: buildSiteHtmlEtag(revision),
    "Last-Modified": newestHttpDate(site.updated_at, page.updated_at),
  };
}

function buildInternalCacheHeaders(headers: HeadersInit): HeadersInit {
  const next = new Headers(headers);
  next.set("Cache-Control", INTERNAL_HTML_CACHE_CONTROL);
  return next;
}

async function resolveRequiredSitesDocumentAssets(c: Context<SitesContext>): Promise<SiteDocumentAssets | null> {
  return timeSite(c, "asset_manifest", () => resolveSitesDocumentAssets(c.env));
}

function sitesAssetsUnavailable(c: Context<SitesContext>): Response {
  return c.text("Sites assets unavailable", 500, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

function redirect(c: Context<SitesContext>, path: string): Response {
  const originalUrl = new URL(c.req.url);
  const target = new URL(path, originalUrl);
  target.search = originalUrl.search;
  return c.redirect(target.toString(), 308);
}

async function siteNotFound(c: Context<SitesContext>, site: ResolvedSite | null = null): Promise<Response> {
  const assets = await resolveRequiredSitesDocumentAssets(c);
  if (!assets) return sitesAssetsUnavailable(c);

  return c.html(
    renderSiteNotFoundDocumentHtml({
      site: site ? { workspaceName: site.workspace_name, workspaceIcon: site.workspace_icon, homeHref: "/" } : null,
      assets,
    }),
    404,
    {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  );
}

function methodNotAllowed(c: Context<SitesContext>): Response {
  return c.text("Method not allowed", 405, {
    "Content-Type": "text/plain; charset=utf-8",
    Allow: "GET, HEAD",
  });
}

function timeSite<T>(c: Context<SitesContext>, name: string, operation: () => Promise<T>): Promise<T> {
  return wrapTime(c, name, Promise.resolve().then(operation));
}

function markSite(c: Context<SitesContext>, name: string, description: string): void {
  setMetric(c, name, description);
}

function newestHttpDate(...values: string[]): string {
  const timestamps = values.map((value) => Date.parse(value)).filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return new Date().toUTCString();
  return new Date(Math.max(...timestamps)).toUTCString();
}
