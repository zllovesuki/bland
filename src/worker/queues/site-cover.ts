import { eq } from "drizzle-orm";

import { isGradientPreset, parseUploadCoverUrl } from "@/shared/page-cover";
import { createSessionDb, type Db } from "@/worker/db/d1/client";
import { pages } from "@/worker/db/d1/schema";
import { createLogger } from "@/worker/lib/logger";
import {
  coverMatches,
  coverMetadata,
  createSiteCoverHash,
  parseGradient,
  resolveUploadCover,
  SITE_COVER_ANIMATED,
  SITE_COVER_FIT,
  SITE_COVER_FORMAT,
  SITE_COVER_GRAVITY,
  SITE_COVER_HEIGHT,
  SITE_COVER_WIDTH,
  siteCoverKey,
  type SiteCoverSource,
  type SupportedLinearGradient,
} from "@/worker/sites/cover";
import type { TasksQueueResult } from "./messages";

const log = createLogger("site-cover");
const COLOR_TABLE_SIZE = 1001;
const UPLOAD_RETRY_DELAY_SECONDS = 30;

interface SiteCoverPage {
  id: string;
  workspace_id: string;
  kind: "doc" | "canvas";
  cover_url: string | null;
  archived_at: string | null;
}

export async function handleSiteCover(pageId: string, env: Env): Promise<TasksQueueResult> {
  const { db } = createSessionDb(env.DB, "first-primary");
  const page = await db
    .select({
      id: pages.id,
      workspace_id: pages.workspace_id,
      kind: pages.kind,
      cover_url: pages.cover_url,
      archived_at: pages.archived_at,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .get();

  if (!page) {
    log.info("site_cover_retry", { pageId, reason: "page_not_yet_visible" });
    return { kind: "retry", delaySeconds: 2 };
  }
  if (page.archived_at || page.kind !== "doc") {
    log.info("site_cover_skipped", {
      pageId,
      workspaceId: page.workspace_id,
      kind: page.kind,
      archived: !!page.archived_at,
    });
    return { kind: "ok" };
  }

  const coverUrl = page.cover_url;
  if (!coverUrl) {
    log.info("site_cover_skipped", { pageId, workspaceId: page.workspace_id, reason: "empty" });
    return { kind: "ok" };
  }

  const uploadId = parseUploadCoverUrl(coverUrl);
  if (uploadId) return handleUpload(db, page, uploadId, env);

  if (!isGradientPreset(coverUrl)) {
    log.info("site_cover_skipped", { pageId, workspaceId: page.workspace_id, reason: "unsupported_cover" });
    return { kind: "ok" };
  }

  const gradient = parseGradient(coverUrl);
  if (!gradient) {
    log.info("site_cover_skipped", { pageId, workspaceId: page.workspace_id, reason: "unsupported_gradient" });
    return { kind: "ok" };
  }

  const coverHash = await createSiteCoverHash(coverUrl);
  const key = siteCoverKey(page.workspace_id, page.id);
  const existing = await env.SITES.get(key);
  if (existing && coverMatches(existing, coverUrl, coverHash)) {
    log.info("site_cover_skipped", { pageId, workspaceId: page.workspace_id, reason: "fresh" });
    return { kind: "ok" };
  }

  const png = await renderGradientPng(gradient);
  await putCover(env, page, coverUrl, coverHash, "gradient", png);

  log.info("site_cover_written", {
    pageId,
    workspaceId: page.workspace_id,
    bytes: png.byteLength,
    width: SITE_COVER_WIDTH,
    height: SITE_COVER_HEIGHT,
  });
  return { kind: "ok" };
}

async function handleUpload(
  db: Db,
  page: Pick<SiteCoverPage, "id" | "workspace_id" | "cover_url">,
  uploadId: string,
  env: Env,
): Promise<TasksQueueResult> {
  const coverUrl = page.cover_url;
  if (!coverUrl) return { kind: "ok" };

  const upload = await resolveUploadCover(db, page, uploadId);
  if (!upload) {
    log.info("site_cover_skipped", { pageId: page.id, workspaceId: page.workspace_id, reason: "unsupported_upload" });
    return { kind: "ok" };
  }

  const coverHash = await createSiteCoverHash(coverUrl);
  const key = siteCoverKey(page.workspace_id, page.id);
  const existing = await env.SITES.get(key);
  if (existing && coverMatches(existing, coverUrl, coverHash)) {
    log.info("site_cover_skipped", { pageId: page.id, workspaceId: page.workspace_id, reason: "fresh" });
    return { kind: "ok" };
  }

  const object = await env.R2.get(upload.r2Key);
  if (!object) {
    log.info("site_cover_skipped", {
      pageId: page.id,
      workspaceId: page.workspace_id,
      reason: "upload_object_missing",
    });
    return { kind: "ok" };
  }

  let transformed: ArrayBuffer;
  try {
    transformed = await renderUpload(env.IMAGES, object.body);
  } catch (error) {
    log.warn("site_cover_transform_retry", {
      pageId: page.id,
      workspaceId: page.workspace_id,
      uploadId: upload.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: "retry", delaySeconds: UPLOAD_RETRY_DELAY_SECONDS };
  }

  await putCover(env, page, coverUrl, coverHash, "upload", transformed);
  log.info("site_cover_written", {
    pageId: page.id,
    workspaceId: page.workspace_id,
    uploadId: upload.id,
    width: SITE_COVER_WIDTH,
    height: SITE_COVER_HEIGHT,
    source: "upload",
  });
  return { kind: "ok" };
}

async function renderUpload(images: ImagesBinding, input: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const result = await images
    .input(input)
    .transform({
      width: SITE_COVER_WIDTH,
      height: SITE_COVER_HEIGHT,
      fit: SITE_COVER_FIT,
      gravity: SITE_COVER_GRAVITY,
    })
    .output({
      format: SITE_COVER_FORMAT,
      anim: SITE_COVER_ANIMATED,
    });
  const response = result.response();
  if (!response.body) throw new Error("Images produced no cover body");
  return response.arrayBuffer();
}

async function putCover(
  env: Pick<Env, "SITES">,
  page: Pick<SiteCoverPage, "id" | "workspace_id">,
  coverUrl: string,
  coverHash: string,
  source: SiteCoverSource,
  body: ArrayBuffer | ArrayBufferView,
): Promise<void> {
  await env.SITES.put(siteCoverKey(page.workspace_id, page.id), body, {
    httpMetadata: { contentType: SITE_COVER_FORMAT },
    customMetadata: coverMetadata(coverUrl, coverHash, source),
  });
}

async function renderGradientPng(gradient: SupportedLinearGradient): Promise<Uint8Array> {
  const rgba = rasterizeGradient(gradient);
  const { BitDepth, ColorType, Compression, FilterType, encode } = await import("@cf-wasm/png/workerd");
  return encode(rgba, SITE_COVER_WIDTH, SITE_COVER_HEIGHT, {
    color: ColorType.RGBA,
    depth: BitDepth.Eight,
    compression: Compression.Fast,
    filter: FilterType.NoFilter,
  });
}

function rasterizeGradient(gradient: SupportedLinearGradient): Uint8Array {
  const pixels = new Uint8Array(SITE_COVER_WIDTH * SITE_COVER_HEIGHT * 4);
  const colors = buildColorTable(gradient);
  const radians = (gradient.angleDeg * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const corners = [0, SITE_COVER_WIDTH * dx, SITE_COVER_HEIGHT * dy, SITE_COVER_WIDTH * dx + SITE_COVER_HEIGHT * dy];
  const minProjection = Math.min(...corners);
  const maxProjection = Math.max(...corners);
  const scale = (COLOR_TABLE_SIZE - 1) / Math.max(maxProjection - minProjection, 1);
  const xStep = dx * scale;

  let offset = 0;
  for (let y = 0; y < SITE_COVER_HEIGHT; y += 1) {
    let colorIndex = ((y + 0.5) * dy + 0.5 * dx - minProjection) * scale;
    for (let x = 0; x < SITE_COVER_WIDTH; x += 1) {
      const tableIndex = clampColorIndex(colorIndex);
      const tableOffset = tableIndex * 4;
      pixels[offset] = colors[tableOffset];
      pixels[offset + 1] = colors[tableOffset + 1];
      pixels[offset + 2] = colors[tableOffset + 2];
      pixels[offset + 3] = 255;
      offset += 4;
      colorIndex += xStep;
    }
  }

  return pixels;
}

function buildColorTable(gradient: SupportedLinearGradient): Uint8Array {
  const colors = new Uint8Array(COLOR_TABLE_SIZE * 4);
  let segment = 0;

  for (let i = 0; i < COLOR_TABLE_SIZE; i += 1) {
    const position = (i / (COLOR_TABLE_SIZE - 1)) * 100;
    while (segment < gradient.stops.length - 2 && position > gradient.stops[segment + 1].position) {
      segment += 1;
    }

    const from = gradient.stops[segment];
    const to = gradient.stops[Math.min(segment + 1, gradient.stops.length - 1)];
    const span = to.position - from.position;
    const t = span <= 0 ? 1 : (position - from.position) / span;
    const offset = i * 4;
    colors[offset] = interpolateByte(from.r, to.r, t);
    colors[offset + 1] = interpolateByte(from.g, to.g, t);
    colors[offset + 2] = interpolateByte(from.b, to.b, t);
    colors[offset + 3] = 255;
  }

  return colors;
}

function interpolateByte(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * Math.min(1, Math.max(0, t)));
}

function clampColorIndex(value: number): number {
  if (value <= 0) return 0;
  if (value >= COLOR_TABLE_SIZE - 1) return COLOR_TABLE_SIZE - 1;
  return Math.round(value);
}
