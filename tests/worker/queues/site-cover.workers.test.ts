import { env } from "cloudflare:workers";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";

import { GRADIENT_PRESETS } from "@/shared/page-cover";
import { handleSiteCover } from "@/worker/queues/site-cover";
import {
  createSiteCoverHash,
  SITE_COVER_FORMAT,
  SITE_COVER_HEIGHT,
  SITE_COVER_WIDTH,
  siteCoverKey,
} from "@/worker/sites/cover";
import { resetD1Tables } from "@tests/worker/helpers/db";
import { seedPage, seedUpload, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const UPLOAD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function bytesFromBase64(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function tinyPngBytes(): Uint8Array {
  return bytesFromBase64(TINY_PNG_BASE64);
}

async function clearBuckets(): Promise<void> {
  const [r2Listing, sitesListing] = await Promise.all([env.R2.list(), env.SITES.list()]);
  await Promise.all([
    ...r2Listing.objects.map((object) => env.R2.delete(object.key)),
    ...sitesListing.objects.map((object) => env.SITES.delete(object.key)),
  ]);
}

describe("handleSiteCover", () => {
  beforeEach(async () => {
    await resetD1Tables();
    await clearBuckets();
  });

  it("returns retry when the page is not yet visible in D1", async () => {
    await expect(handleSiteCover(ulid(), env)).resolves.toEqual({ kind: "retry", delaySeconds: 2 });
  });

  it("renders a supported preset gradient to the fixed Sites cover key", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: GRADIENT_PRESETS[0] });

    await expect(handleSiteCover(page.id, env)).resolves.toEqual({ kind: "ok" });

    const object = await env.SITES.get(siteCoverKey(ws.id, page.id));
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe("image/png");
    expect(object?.customMetadata).toMatchObject({
      cover_hash: await createSiteCoverHash(GRADIENT_PRESETS[0]),
      cover_url: GRADIENT_PRESETS[0],
      width: String(SITE_COVER_WIDTH),
      height: String(SITE_COVER_HEIGHT),
      source: "gradient",
    });
  });

  it("skips fresh generated cover objects", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const cover = GRADIENT_PRESETS[0];
    const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: cover });
    const key = siteCoverKey(ws.id, page.id);
    await env.SITES.put(key, "already-rendered", {
      httpMetadata: { contentType: "image/png" },
      customMetadata: {
        cover_hash: await createSiteCoverHash(cover),
        cover_url: cover,
        width: String(SITE_COVER_WIDTH),
        height: String(SITE_COVER_HEIGHT),
        source: "gradient",
      },
    });

    await expect(handleSiteCover(page.id, env)).resolves.toEqual({ kind: "ok" });
    await expect(env.SITES.get(key).then((object) => object?.text())).resolves.toBe("already-rendered");
  });

  it("no-ops unsupported current covers without retry", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const pages = [
      await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: null }),
      await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/upload_1" }),
      await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        cover_url: "linear-gradient(90deg, #000000 0%, #ffffff 100%)",
      }),
      await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        cover_url: "linear-gradient(to right, #000000 0%, #ffffff 100%)",
      }),
      await seedPage({ workspace_id: ws.id, created_by: owner.id, kind: "canvas", cover_url: GRADIENT_PRESETS[0] }),
    ];

    for (const page of pages) {
      await expect(handleSiteCover(page.id, env)).resolves.toEqual({ kind: "ok" });
      await expect(env.SITES.get(siteCoverKey(ws.id, page.id))).resolves.toBeNull();
    }
  });

  it("transforms safe uploaded covers to fixed Sites PNG artifacts", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });

    for (const contentType of UPLOAD_IMAGE_TYPES) {
      const uploadId = `upload-${contentType.split("/")[1]}`;
      const coverUrl = `/uploads/${uploadId}`;
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: coverUrl });
      const upload = await seedUpload({
        id: uploadId,
        workspace_id: ws.id,
        uploaded_by: owner.id,
        page_id: page.id,
        content_type: contentType,
        r2_key: `${ws.id}/${page.id}/${uploadId}`,
      });
      await env.R2.put(upload.r2_key, tinyPngBytes(), { httpMetadata: { contentType } });

      await expect(handleSiteCover(page.id, env)).resolves.toEqual({ kind: "ok" });

      const object = await env.SITES.get(siteCoverKey(ws.id, page.id));
      expect(object).not.toBeNull();
      expect(object?.httpMetadata?.contentType).toBe(SITE_COVER_FORMAT);
      expect(object?.customMetadata).toMatchObject({
        cover_hash: await createSiteCoverHash(coverUrl),
        cover_url: coverUrl,
        width: String(SITE_COVER_WIDTH),
        height: String(SITE_COVER_HEIGHT),
        source: "upload",
      });
    }
  });

  it("skips doomed uploaded covers without writing Sites artifacts", async () => {
    const owner = await seedUser();
    const ws = await seedWorkspace({ owner_id: owner.id });
    const otherWs = await seedWorkspace({ owner_id: owner.id });
    const otherPage = await seedPage({ workspace_id: ws.id, created_by: owner.id });
    const otherWorkspacePage = await seedPage({ workspace_id: otherWs.id, created_by: owner.id });
    const cases = [
      await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/missing-row" }),
      await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/wrong-page" }),
      await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/wrong-workspace" }),
      await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/unsafe-upload" }),
      await seedPage({ workspace_id: ws.id, created_by: owner.id, cover_url: "/uploads/missing-object" }),
    ];

    await seedUpload({
      id: "wrong-page",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: otherPage.id,
      r2_key: `${ws.id}/${otherPage.id}/wrong-page.png`,
    });
    await seedUpload({
      id: "wrong-workspace",
      workspace_id: otherWs.id,
      uploaded_by: owner.id,
      page_id: otherWorkspacePage.id,
      r2_key: `${otherWs.id}/${otherWorkspacePage.id}/wrong-workspace.png`,
    });
    await seedUpload({
      id: "unsafe-upload",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: cases[3].id,
      content_type: "application/pdf",
      r2_key: `${ws.id}/${cases[3].id}/unsafe.pdf`,
    });
    await seedUpload({
      id: "missing-object",
      workspace_id: ws.id,
      uploaded_by: owner.id,
      page_id: cases[4].id,
      r2_key: `${ws.id}/${cases[4].id}/missing.png`,
    });
    await env.R2.put(`${ws.id}/${otherPage.id}/wrong-page.png`, "PNG");
    await env.R2.put(`${otherWs.id}/${otherWorkspacePage.id}/wrong-workspace.png`, "PNG");
    await env.R2.put(`${ws.id}/${cases[3].id}/unsafe.pdf`, "PDF");

    for (const page of cases) {
      await expect(handleSiteCover(page.id, env)).resolves.toEqual({ kind: "ok" });
      await expect(env.SITES.get(siteCoverKey(page.workspace_id, page.id))).resolves.toBeNull();
    }
  });
});
