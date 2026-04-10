import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { ulid } from "ulidx";

import { jwtVerify } from "jose";

import { uploads, pages, pageShares } from "@/worker/db/d1/schema";
import { requireAuth, optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership } from "@/worker/lib/membership";
import { canEdit, canAccessPage } from "@/worker/lib/permissions";
import { getPage } from "@/worker/lib/page-access";
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
// Accepts JWT auth (workspace members) or ?share=<token> (shared-link editors)
uploadsRouter.post("/workspaces/:wid/uploads/presign", optionalAuth, rateLimit("RL_API"), async (c) => {
  const workspaceId = c.req.param("wid");
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const data = await parseBody(c, PresignRequest);
  if (data instanceof Response) return data;

  let uploadedBy: string | null = null;

  // Try JWT auth first
  if (user) {
    const membership = await checkMembership(db, user.id, workspaceId);
    if (membership && canEdit(membership.role)) {
      uploadedBy = user.id;
    } else if (data.page_id) {
      // Guest or non-member: check page-level edit access
      const hasEdit = await canAccessPage(db, { type: "user", userId: user.id }, data.page_id, workspaceId, "edit");
      if (hasEdit) uploadedBy = user.id;
    }
  }

  // Fall through to share token if JWT auth didn't authorize (spec §10.8)
  if (!uploadedBy && shareToken) {
    if (!data.page_id) {
      return c.json({ error: "bad_request", message: "page_id is required for shared-link uploads" }, 400);
    }
    const hasEdit = await canAccessPage(db, { type: "link", token: shareToken }, data.page_id, workspaceId, "edit");
    if (!hasEdit) {
      return c.json({ error: "forbidden", message: "Share link does not grant edit access" }, 403);
    }
    const share = await db
      .select({ created_by: pageShares.created_by })
      .from(pageShares)
      .where(and(eq(pageShares.link_token, shareToken), eq(pageShares.grantee_type, "link")))
      .get();
    if (!share) {
      return c.json({ error: "forbidden", message: "Invalid share token" }, 403);
    }
    uploadedBy = share.created_by;
  }

  if (!uploadedBy) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  // Validate page_id belongs to workspace if provided
  if (data.page_id) {
    const page = await getPage(db, data.page_id, workspaceId);
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
    uploaded_by: uploadedBy,
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
// Accepts JWT auth (workspace members) or ?share=<token> (shared-link editors)
uploadServingRouter.put("/:id/data", optionalAuth, rateLimit("RL_API"), async (c) => {
  const uploadId = c.req.param("id");
  const user = c.get("user");
  const db = c.get("db");
  const shareToken = c.req.query("share");

  const upload = await db.select().from(uploads).where(eq(uploads.id, uploadId)).get();
  if (!upload) {
    return c.json({ error: "not_found", message: "Upload not found" }, 404);
  }

  let putAuthorized = false;

  // Try JWT auth first
  if (user && upload.uploaded_by === user.id) {
    const membership = await checkMembership(db, user.id, upload.workspace_id);
    if (membership && canEdit(membership.role)) {
      putAuthorized = true;
    } else if (upload.page_id) {
      // Guest or non-member: check page-level edit access
      putAuthorized = await canAccessPage(
        db,
        { type: "user", userId: user.id },
        upload.page_id,
        upload.workspace_id,
        "edit",
      );
    }
  }

  // Fall through to share token if JWT auth didn't authorize (spec §10.8)
  if (!putAuthorized && shareToken && upload.page_id) {
    putAuthorized = await canAccessPage(
      db,
      { type: "link", token: shareToken },
      upload.page_id,
      upload.workspace_id,
      "edit",
    );
  }

  if (!putAuthorized) {
    return c.json({ error: "forbidden", message: "You do not have edit access" }, 403);
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

// GET /:id - Serve file from R2 (auth via refresh cookie or ?share=token)
uploadServingRouter.get("/:id", async (c) => {
  const uploadId = c.req.param("id");
  const db = c.get("db");

  const upload = await db.select().from(uploads).where(eq(uploads.id, uploadId)).get();
  if (!upload) {
    return c.json({ error: "not_found", message: "Upload not found" }, 404);
  }

  // Page-scoped uploads: if the linked page is archived or missing, conceal the asset.
  // This keeps all callers on the same 404 path instead of leaking through auth outcomes.
  if (upload.page_id) {
    const page = await getPage(db, upload.page_id, upload.workspace_id);
    if (!page) {
      return c.json({ error: "not_found", message: "Upload not found" }, 404);
    }
  }

  // Try auth via refresh cookie first (same-origin browser requests)
  const cookies = parseCookies(c.req.header("cookie"));
  const refreshToken = cookies[REFRESH_COOKIE];
  let authorized = false;

  if (refreshToken) {
    try {
      const { payload } = await jwtVerify(refreshToken, getJwtSecret(c.env), { algorithms: [JWT_ALGORITHM] });
      if (payload.sub && payload.type === "refresh") {
        // Workspace-level uploads (e.g. avatars) are visible to any authenticated user
        if (!upload.page_id) {
          authorized = true;
        }
        const membership = !authorized ? await checkMembership(db, payload.sub, upload.workspace_id) : null;
        if (membership) {
          if (membership.role === "guest") {
            // Guests need page-level share access for uploads
            if (upload.page_id) {
              authorized = await canAccessPage(
                db,
                { type: "user", userId: payload.sub },
                upload.page_id,
                upload.workspace_id,
                "view",
              );
            }
          } else {
            authorized = true;
          }
        } else if (upload.page_id) {
          // Non-member: check page-level share access
          authorized = await canAccessPage(
            db,
            { type: "user", userId: payload.sub },
            upload.page_id,
            upload.workspace_id,
            "view",
          );
        }
      }
    } catch {
      // Cookie auth failed — fall through to share token
    }
  }

  // Fallback: share token auth for shared-link users (spec §10.7)
  if (!authorized) {
    const shareToken = c.req.query("share");
    if (shareToken && upload.page_id) {
      authorized = await canAccessPage(
        db,
        { type: "link", token: shareToken },
        upload.page_id,
        upload.workspace_id,
        "view",
      );
    }
  }

  if (!authorized) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
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
