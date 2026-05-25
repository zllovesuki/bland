import { and, eq } from "drizzle-orm";

import { isGradientPreset, parseUploadCoverUrl } from "@/shared/page-cover";
import type { SiteOgImage } from "@/sites/types";
import type { Db } from "@/worker/db/d1/client";
import { uploads } from "@/worker/db/d1/schema";
import type { ResolvedPublishedPage } from "@/worker/lib/published-pages";
import { createRenderDependencyHash } from "@/worker/sites/cache";

export const SITE_COVER_WIDTH = 1200;
export const SITE_COVER_HEIGHT = 630;
export const SITE_COVER_FIT = "cover";
export const SITE_COVER_GRAVITY = "center";
export const SITE_COVER_FORMAT = "image/png";
export const SITE_COVER_ANIMATED = false;

const LINEAR_GRADIENT = /^linear-gradient\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))deg\s*,\s*(.+)\s*\)$/;
const GRADIENT_STOP = /^\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))%\s*$/;
const OG_SAFE_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const VERSIONED_CACHE_CONTROL = "public, max-age=31536000, immutable";
const UNVERSIONED_CACHE_CONTROL = "public, max-age=300, must-revalidate";

export type SiteCoverSource = "gradient" | "upload";

export interface ParsedGradientStop {
  position: number;
  r: number;
  g: number;
  b: number;
}

export interface SupportedLinearGradient {
  angleDeg: number;
  stops: ParsedGradientStop[];
}

export interface ServeSiteCoverArgs {
  env: Pick<Env, "R2" | "SITES" | "TASKS_QUEUE">;
  db: Db;
  page: ResolvedPublishedPage;
  versionHash: string | null;
}

export interface ResolvedUploadCover {
  id: string;
  contentType: string;
  r2Key: string;
}

export function siteCoverKey(workspaceId: string, pageId: string): string {
  return `${workspaceId}/${pageId}/cover.png`;
}

export function createSiteCoverHash(coverUrl: string): Promise<string> {
  return createRenderDependencyHash({
    version: "site-cover:v2",
    width: SITE_COVER_WIDTH,
    height: SITE_COVER_HEIGHT,
    fit: SITE_COVER_FIT,
    gravity: SITE_COVER_GRAVITY,
    format: SITE_COVER_FORMAT,
    anim: SITE_COVER_ANIMATED,
    coverUrl,
  });
}

export function parseGradient(coverUrl: string): SupportedLinearGradient | null {
  const match = LINEAR_GRADIENT.exec(coverUrl);
  if (!match) return null;

  const angleDeg = Number(match[1]);
  if (!Number.isFinite(angleDeg)) return null;

  const rawStops = match[2].split(",");
  if (rawStops.length < 2) return null;

  const stops: ParsedGradientStop[] = [];
  for (const rawStop of rawStops) {
    const stop = GRADIENT_STOP.exec(rawStop);
    if (!stop) return null;
    const color = parseHexColor(stop[1]);
    const position = clampPercent(Number(stop[2]));
    if (!color || !Number.isFinite(position)) return null;
    stops.push({ position, ...color });
  }

  if (stops.length < 2) return null;
  stops.sort((a, b) => a.position - b.position);
  return { angleDeg, stops };
}

export function isOgImageType(contentType: string): boolean {
  return safeImageType(contentType) !== null;
}

export async function resolveUploadCover(
  db: Db,
  page: Pick<ResolvedPublishedPage, "id" | "workspace_id">,
  uploadId: string,
): Promise<ResolvedUploadCover | null> {
  const upload = await db
    .select({
      id: uploads.id,
      content_type: uploads.content_type,
      r2_key: uploads.r2_key,
    })
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.workspace_id, page.workspace_id), eq(uploads.page_id, page.id)))
    .get();
  const contentType = upload ? safeImageType(upload.content_type) : null;
  if (!upload || !contentType) return null;
  return { id: upload.id, contentType, r2Key: upload.r2_key };
}

export async function resolveOgCover(
  db: Db,
  page: ResolvedPublishedPage,
  canonicalUrl: string,
): Promise<SiteOgImage | null> {
  const coverUrl = page.cover_url;
  if (!coverUrl) return null;

  const uploadId = parseUploadCoverUrl(coverUrl);
  if (uploadId) {
    const upload = await resolveUploadCover(db, page, uploadId);
    if (!upload) return null;
    return {
      url: await absoluteCoverUrl(page.id, coverUrl, canonicalUrl),
      type: SITE_COVER_FORMAT,
      width: SITE_COVER_WIDTH,
      height: SITE_COVER_HEIGHT,
    };
  }

  if (!isGradientPreset(coverUrl) || !parseGradient(coverUrl)) return null;
  return {
    url: await absoluteCoverUrl(page.id, coverUrl, canonicalUrl),
    type: SITE_COVER_FORMAT,
    width: SITE_COVER_WIDTH,
    height: SITE_COVER_HEIGHT,
  };
}

export async function serveSiteCover(args: ServeSiteCoverArgs): Promise<Response> {
  const { env, db, page, versionHash } = args;
  const coverUrl = page.cover_url;
  if (!coverUrl) return coverNotFound();

  const coverHash = await createSiteCoverHash(coverUrl);
  if (versionHash !== null && versionHash !== coverHash) return coverNotFound();

  const cacheControl = versionHash ? VERSIONED_CACHE_CONTROL : UNVERSIONED_CACHE_CONTROL;
  const uploadId = parseUploadCoverUrl(coverUrl);
  if (uploadId) {
    const upload = await resolveUploadCover(db, page, uploadId);
    if (!upload) return coverNotFound();
    const source = await env.R2.head(upload.r2Key);
    if (!source) return coverNotFound();
    return serveArtifact({
      env,
      page,
      coverUrl,
      coverHash,
      cacheControl,
    });
  }

  if (!isGradientPreset(coverUrl) || !parseGradient(coverUrl)) return coverNotFound();

  return serveArtifact({
    env,
    page,
    coverUrl,
    coverHash,
    cacheControl,
  });
}

async function serveArtifact(args: {
  env: Pick<Env, "SITES" | "TASKS_QUEUE">;
  page: Pick<ResolvedPublishedPage, "id" | "workspace_id">;
  coverUrl: string;
  coverHash: string;
  cacheControl: string;
}): Promise<Response> {
  const { env, page, coverUrl, coverHash, cacheControl } = args;
  const object = await env.SITES.get(siteCoverKey(page.workspace_id, page.id));
  if (!object || !coverMatches(object, coverUrl, coverHash)) {
    await enqueueSiteCover(env, page.id);
    return coverRepairing();
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": SITE_COVER_FORMAT,
      "Content-Length": String(object.size),
      "Cache-Control": cacheControl,
      ETag: object.httpEtag,
    },
  });
}

export function coverMetadata(coverUrl: string, coverHash: string, source: SiteCoverSource): Record<string, string> {
  return {
    cover_hash: coverHash,
    cover_url: coverUrl,
    width: String(SITE_COVER_WIDTH),
    height: String(SITE_COVER_HEIGHT),
    source,
  };
}

export async function enqueueSiteCover(env: Pick<Env, "TASKS_QUEUE">, pageId: string): Promise<void> {
  try {
    await env.TASKS_QUEUE.send({ type: "site-cover", pageId });
  } catch {
    // Generated covers are derived artifacts; later saves or requests can repair them.
  }
}

export function coverMatches(object: R2Object, coverUrl: string, coverHash: string): boolean {
  return (
    object.customMetadata?.cover_hash === coverHash &&
    object.customMetadata.cover_url === coverUrl &&
    object.customMetadata.width === String(SITE_COVER_WIDTH) &&
    object.customMetadata.height === String(SITE_COVER_HEIGHT)
  );
}

function absoluteCoverUrl(pageId: string, coverUrl: string, canonicalUrl: string): Promise<string> {
  return createSiteCoverHash(coverUrl).then((hash) => {
    const url = new URL(`/_assets/${pageId}/cover`, canonicalUrl);
    url.searchParams.set("v", hash);
    return url.toString();
  });
}

function safeImageType(contentType: string): string | null {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return OG_SAFE_UPLOAD_TYPES.has(normalized) ? normalized : null;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  if (hex.length === 3) {
    return {
      r: Number.parseInt(`${hex[0]}${hex[0]}`, 16),
      g: Number.parseInt(`${hex[1]}${hex[1]}`, 16),
      b: Number.parseInt(`${hex[2]}${hex[2]}`, 16),
    };
  }
  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function coverNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function coverRepairing(): Response {
  return new Response(null, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "5",
    },
  });
}
