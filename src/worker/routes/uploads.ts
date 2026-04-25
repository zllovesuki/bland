import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";

import { jwtVerify } from "jose";

import type { AppContext } from "@/worker/app-context";
import { uploads, pageShares } from "@/worker/db/d1/schema";
import { optionalAuth } from "@/worker/middleware/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { checkMembership } from "@/worker/lib/membership";
import { canEdit, canAccessPage } from "@/worker/lib/permissions";
import { getPage } from "@/worker/lib/page-access";
import { REFRESH_COOKIE, getJwtSecret } from "@/worker/lib/auth";
import { parseBody } from "@/worker/lib/validate";
import { createLogger } from "@/worker/lib/logger";
import { JWT_ALGORITHM } from "@/worker/lib/constants";
import { PresignRequest } from "@/shared/types";
import { getPageEditEntitlements } from "@/shared/entitlements";

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

  // Shared-surface precedence: when `?share=<token>` is present, the shared principal
  // authorizes the upload and bearer-member auth does not apply. Matches the WS
  // "share wins" invariant and keeps `/s/:token` link-scoped end to end.
  if (shareToken) {
    if (!data.page_id) {
      return c.json({ error: "bad_request", message: "page_id is required for shared-link uploads" }, 400);
    }
    const hasEdit = await canAccessPage(db, { type: "link", token: shareToken }, data.page_id, workspaceId, "edit");
    if (!hasEdit || !getPageEditEntitlements("shared", "edit").uploadImage) {
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
  } else if (user) {
    const membership = await checkMembership(db, user.id, workspaceId);
    if (membership && canEdit(membership.role)) {
      uploadedBy = user.id;
    } else if (data.page_id) {
      const hasEdit = await canAccessPage(db, { type: "user", userId: user.id }, data.page_id, workspaceId, "edit");
      if (hasEdit && getPageEditEntitlements("canonical", "edit").uploadImage) uploadedBy = user.id;
    }
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

  // Shared-surface precedence (same rule as presign): `?share=<token>` wins. The
  // share path intentionally does not check `upload.uploaded_by === user.id` —
  // shared-link editors write the R2 body via the share principal, and the
  // `uploads` row's `uploaded_by` records the share author, not the writer.
  if (shareToken && upload.page_id) {
    putAuthorized =
      (await canAccessPage(db, { type: "link", token: shareToken }, upload.page_id, upload.workspace_id, "edit")) &&
      getPageEditEntitlements("shared", "edit").uploadImage;
    if (!putAuthorized) {
      return c.json({ error: "forbidden", message: "Share link does not grant edit access" }, 403);
    }
  } else {
    // Canonical path: distinguish "no valid bearer" (401, refresh-eligible)
    // from "valid bearer without rights" (403, terminal). The client refresh
    // gate at api.ts triggers only on 401 / 403+`unauthorized`.
    if (!user) {
      return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
    }
    if (upload.uploaded_by === user.id) {
      const membership = await checkMembership(db, user.id, upload.workspace_id);
      if (membership && canEdit(membership.role)) {
        putAuthorized = true;
      } else if (upload.page_id) {
        putAuthorized =
          (await canAccessPage(db, { type: "user", userId: user.id }, upload.page_id, upload.workspace_id, "edit")) &&
          getPageEditEntitlements("canonical", "edit").uploadImage;
      }
    }
    if (!putAuthorized) {
      return c.json({ error: "forbidden", message: "You do not have edit access" }, 403);
    }
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
uploadServingRouter.get("/:id", rateLimit("RL_API"), async (c) => {
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

  const shareToken = c.req.query("share");
  let authorized = false;

  // Shared-surface precedence: a page-scoped asset fetched with `?share=<token>`
  // authorizes against the share principal and does NOT fall back to cookie auth.
  // A workspace member carrying both a refresh cookie and a share token resolves
  // through the share, matching the WS / HTTP shared-follow-on invariant.
  if (shareToken && upload.page_id) {
    authorized = await canAccessPage(
      db,
      { type: "link", token: shareToken },
      upload.page_id,
      upload.workspace_id,
      "view",
    );
  } else {
    // Cookie-based canonical auth. Used for workspace-level assets (avatars) and
    // for page-scoped assets when no share token is present.
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    if (refreshToken) {
      try {
        const { payload } = await jwtVerify(refreshToken, getJwtSecret(c.env), { algorithms: [JWT_ALGORITHM] });
        if (payload.sub && payload.type === "refresh") {
          if (!upload.page_id) {
            authorized = true;
          } else {
            const membership = await checkMembership(db, payload.sub, upload.workspace_id);
            if (membership && membership.role !== "guest") {
              authorized = true;
            } else {
              authorized = await canAccessPage(
                db,
                { type: "user", userId: payload.sub },
                upload.page_id,
                upload.workspace_id,
                "view",
              );
            }
          }
        }
      } catch {
        // Cookie auth failed — leave `authorized = false`
      }
    }
  }

  if (!authorized) {
    return c.json({ error: "unauthorized", message: "Authentication required" }, 401);
  }

  const object = await c.env.R2.get(upload.r2_key);
  if (!object) {
    return c.json({ error: "not_found", message: "File not found" }, 404);
  }

  // Page-scoped assets use a short private TTL so share revocation takes effect
  // within minutes instead of a year. Workspace-level assets (avatars) keep the
  // long immutable cache policy because they are not revocation-sensitive.
  const cacheControl = upload.page_id
    ? "private, max-age=300, must-revalidate"
    : "private, max-age=31536000, immutable";

  return new Response(object.body, {
    headers: {
      "Content-Type": upload.content_type,
      "Content-Length": String(object.size),
      "Cache-Control": cacheControl,
    },
  });
});
