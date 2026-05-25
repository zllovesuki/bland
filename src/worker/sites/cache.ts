import {
  parseSitePmJsonEnvelope as parseEnvelopeText,
  type SitePmJsonEnvelope,
  SitePmJsonEnvelopeSchema,
} from "@/shared/sites/pm-json-schemas";
import type { ResolvedPublishedPage, ResolvedSite } from "@/worker/lib/published-pages";

const SITES_CACHE_NAME = "sites:v1";
const SITES_HTML_CACHE_TAG = "sites-html";

export type { SitePmJsonEnvelope };

export async function getSitesCache(): Promise<Cache> {
  return caches.open(SITES_CACHE_NAME);
}

/**
 * Cache API key. Carries the visitor's host and path, drops visitor query
 * params, and normalizes the method. Visitors never see this URL.
 */
export function buildSiteCacheKey(request: Request): Request {
  const original = new URL(request.url);
  const normalized = new URL(`${original.protocol}//${original.host}${original.pathname}`);
  return new Request(normalized.toString(), { method: "GET" });
}

export function buildSiteCacheTags(
  site: Pick<ResolvedSite, "workspace_id">,
  page: Pick<ResolvedPublishedPage, "id" | "published_root_id">,
): string {
  return [SITES_HTML_CACHE_TAG, `site:${site.workspace_id}`, `page:${page.id}`, `root:${page.published_root_id}`].join(
    ",",
  );
}

export function getSitesRendererVersion(env: Pick<Env, "CF_VERSION_METADATA">): string {
  return env.CF_VERSION_METADATA.id;
}

export interface SiteHtmlRevisionInput {
  rendererVersion: string;
  artifactEtag: string;
  site: Pick<
    ResolvedSite,
    "workspace_id" | "slug" | "home_page_id" | "updated_at" | "workspace_name" | "workspace_icon"
  >;
  page: Pick<ResolvedPublishedPage, "id" | "title" | "icon" | "cover_url" | "updated_at" | "published_root_id">;
  canonicalPath: string;
  currentIsHome: boolean;
}

export async function createSiteHtmlRevision(input: SiteHtmlRevisionInput): Promise<string> {
  return createRenderDependencyHash({
    rendererVersion: input.rendererVersion,
    artifactEtag: input.artifactEtag,
    site: {
      workspaceId: input.site.workspace_id,
      slug: input.site.slug,
      homePageId: input.site.home_page_id,
      updatedAt: input.site.updated_at,
      workspaceName: input.site.workspace_name,
      workspaceIcon: input.site.workspace_icon,
    },
    page: {
      id: input.page.id,
      title: input.page.title,
      icon: input.page.icon,
      coverUrl: input.page.cover_url,
      updatedAt: input.page.updated_at,
      publishedRootId: input.page.published_root_id,
    },
    routing: {
      canonicalPath: input.canonicalPath,
      currentIsHome: input.currentIsHome,
    },
  });
}

export function buildSiteHtmlEtag(revision: string): string {
  return `"sites-html:${revision.replace(/"/g, "")}"`;
}

export function siteHtmlEtagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const normalizedEtag = normalizeEtag(etag);
  for (const candidate of ifNoneMatch.split(",")) {
    const trimmed = candidate.trim();
    if (trimmed === "*") return true;
    if (normalizeEtag(trimmed) === normalizedEtag) return true;
  }
  return false;
}

export interface SiteR2Read {
  envelope: SitePmJsonEnvelope | null;
  fresh: boolean;
  etag: string;
}

export async function readSiteR2(
  env: Pick<Env, "SITES">,
  workspaceId: string,
  pageId: string,
  expectedUpdatedAt: string,
): Promise<SiteR2Read | null> {
  const object = await env.SITES.get(buildSiteR2ObjectKey(workspaceId, pageId));
  if (!object) return null;
  const envelope = parseEnvelopeText(await object.text());
  return {
    envelope,
    fresh: envelope !== null && object.customMetadata?.updated_at === expectedUpdatedAt,
    etag: object.httpEtag,
  };
}

export async function writeSiteR2(
  env: Pick<Env, "SITES">,
  workspaceId: string,
  pageId: string,
  envelope: SitePmJsonEnvelope,
): Promise<void> {
  await env.SITES.put(buildSiteR2ObjectKey(workspaceId, pageId), JSON.stringify(envelope), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { updated_at: envelope.updatedAt },
  });
}

export function buildSiteR2ObjectKey(workspaceId: string, pageId: string): string {
  return `${workspaceId}/${pageId}.json`;
}

export function parseSitePmJsonEnvelope(text: string): SitePmJsonEnvelope | null {
  return parseEnvelopeText(text);
}

export { SitePmJsonEnvelopeSchema };

/**
 * Stable SHA-256 fingerprint over render-affecting inputs. Object keys are
 * recursively sorted before JSON.stringify so semantically equal inputs produce
 * identical digests.
 */
export async function createRenderDependencyHash(input: unknown): Promise<string> {
  const canonical = JSON.stringify(canonicalize(input));
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64url(new Uint8Array(digest));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const result: Record<string, unknown> = {};
  for (const [k, v] of entries) result[k] = canonicalize(v);
  return result;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizeEtag(etag: string): string {
  const trimmed = etag.trim();
  return trimmed.startsWith("W/") ? trimmed.slice(2).trim() : trimmed;
}
