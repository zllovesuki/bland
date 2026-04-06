import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulidx";

import { jwtVerify } from "jose";

import { uploads, pages } from "@/worker/db/schema";
import { requireAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership, requireMembership } from "@/worker/lib/membership";
import { canEdit } from "@/worker/lib/permissions";
import { parseCookies, REFRESH_COOKIE, getJwtSecret } from "@/worker/lib/auth";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { JWT_ALGORITHM } from "@/worker/lib/constants";
import { PresignRequest } from "@/shared/types";
import type { AppContext } from "@/worker/router";

const log = createLogger("uploads");

// Presign endpoint — mounted under /api/v1
export const uploadsRouter = new Hono<AppContext>();

// POST /workspaces/:wid/uploads/presign - Create upload record + return upload URL
uploadsRouter.post("/workspaces/:wid/uploads/presign", requireAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user")!;
  const db = c.get("db");

  const membership = await requireMembership(c, db, user.id, workspaceId, true);
  if (membership instanceof Response) return membership;
  if (!canEdit(membership.role)) {
    return c.json({ error: "forbidden", message: "You do not have permission to upload files" }, 403);
  }

  const data = await parseBody(c, PresignRequest);
  if (data instanceof Response) return data;

  // Validate page_id belongs to workspace if provided
  if (data.page_id) {
    const page = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.id, data.page_id), eq(pages.workspace_id, workspaceId)))
      .get();
    if (!page) {
      return c.json({ error: "not_found", message: "Page not found in this workspace" }, 404);
    }
  }

  const uploadId = ulid();
  const r2Key = `${workspaceId}/${uploadId}/${data.filename}`;

  await db.insert(uploads).values({
    id: uploadId,
    workspace_id: workspaceId,
    page_id: data.page_id ?? null,
    uploaded_by: user.id,
    filename: data.filename,
    content_type: data.content_type,
    size_bytes: data.size_bytes,
    r2_key: r2Key,
  });

  log.info("upload_presigned", { uploadId, workspaceId, filename: data.filename, sizeBytes: data.size_bytes });

  return c.json({
    upload: {
      id: uploadId,
      upload_url: `/uploads/${uploadId}/data`,
      url: `/uploads/${uploadId}`,
    },
  });
});

// PUT data + GET serve — mounted at /uploads
export const uploadServingRouter = new Hono<AppContext>();

// PUT /:id/data - Receive file binary and store in R2
uploadServingRouter.put("/:id/data", requireAuth, rateLimit("RL_API"), async (c) => {
  const uploadId = c.req.param("id");
  const user = c.get("user")!;
  const db = c.get("db");

  const upload = await db.select().from(uploads).where(eq(uploads.id, uploadId)).get();
  if (!upload) {
    return c.json({ error: "not_found", message: "Upload not found" }, 404);
  }

  if (upload.uploaded_by !== user.id) {
    return c.json({ error: "forbidden", message: "You can only upload to your own presigned URLs" }, 403);
  }

  // Verify user still has edit access to the workspace
  const membership = await checkMembership(db, user.id, upload.workspace_id);
  if (!membership || !canEdit(membership.role)) {
    return c.json({ error: "forbidden", message: "You no longer have edit access" }, 403);
  }

  // Prevent overwriting an already-uploaded file
  const existing = await c.env.R2.head(upload.r2_key);
  if (existing) {
    return c.json({ error: "conflict", message: "File already uploaded" }, 409);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength > upload.size_bytes * 1.1) {
    return c.json({ error: "bad_request", message: "File exceeds declared size" }, 400);
  }

  await c.env.R2.put(upload.r2_key, body, {
    httpMetadata: { contentType: upload.content_type },
  });

  log.info("upload_completed", { uploadId, r2Key: upload.r2_key, actualSize: body.byteLength });

  return c.json({ ok: true });
});

// GET /:id - Serve file from R2 (auth via refresh cookie)
uploadServingRouter.get("/:id", async (c) => {
  const uploadId = c.req.param("id");
  const db = c.get("db");

  const upload = await db.select().from(uploads).where(eq(uploads.id, uploadId)).get();
  if (!upload) {
    return c.json({ error: "not_found", message: "Upload not found" }, 404);
  }

  // Auth via refresh cookie (same-origin browser requests send it automatically per §20.6)
  const cookies = parseCookies(c.req.header("cookie"));
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  try {
    const { payload } = await jwtVerify(refreshToken, getJwtSecret(c.env), { algorithms: [JWT_ALGORITHM] });
    if (!payload.sub || payload.type !== "refresh") throw new Error("invalid_token");

    const membership = await checkMembership(db, payload.sub, upload.workspace_id);
    if (!membership) {
      return c.json({ error: "forbidden", message: "Access denied" }, 403);
    }
  } catch {
    return c.json({ error: "unauthorized", message: "Invalid authentication" }, 401);
  }

  const object = await c.env.R2.get(upload.r2_key);
  if (!object) {
    return c.json({ error: "not_found", message: "File not found" }, 404);
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": upload.content_type,
      "Content-Length": String(object.size),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
