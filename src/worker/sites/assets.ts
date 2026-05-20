import { and, eq } from "drizzle-orm";

import type { Db } from "@/worker/db/d1/client";
import { uploads } from "@/worker/db/d1/schema";
import type { ResolvedPublishedPage, ResolvedSite } from "@/worker/lib/published-pages";
import { renderSiteNotFoundDocumentHtml } from "@/sites/document";
import { withSitesStaticDocumentPreloadHeaders } from "@/worker/sites/preload-headers";
import { resolveSitesDocumentAssets } from "@/worker/sites/manifest";

export interface AssetGateArgs {
  env: Pick<Env, "ASSETS" | "R2">;
  db: Db;
  site: ResolvedSite;
  page: ResolvedPublishedPage;
  uploadId: string;
}

/**
 * Serve `/_assets/<pageId>/<uploadId>` for a resolved site.
 *
 * All failure modes collapse to a 404 so existence cannot leak across sites,
 * pages, or workspaces. Order matches the Class-A invariant: D1 publish-set
 * resolution before any R2 read.
 */
export async function serveSiteAsset(args: AssetGateArgs): Promise<Response> {
  const { env, db, site, page, uploadId } = args;

  const upload = await db
    .select({
      id: uploads.id,
      content_type: uploads.content_type,
      r2_key: uploads.r2_key,
    })
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.workspace_id, site.workspace_id), eq(uploads.page_id, page.id)))
    .get();

  if (!upload) return notFound(env, site);

  const object = await env.R2.get(upload.r2_key);
  if (!object) return notFound(env, site);

  return new Response(object.body, {
    headers: {
      "Content-Type": upload.content_type,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}

async function notFound(env: Pick<Env, "ASSETS">, site: ResolvedSite): Promise<Response> {
  const assets = await resolveSitesDocumentAssets(env);
  if (!assets) {
    return new Response("Sites assets unavailable", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(
    renderSiteNotFoundDocumentHtml({
      site: { workspaceName: site.workspace_name, workspaceIcon: site.workspace_icon, homeHref: "/" },
      assets,
    }),
    {
      status: 404,
      headers: withSitesStaticDocumentPreloadHeaders(
        {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
        assets,
      ),
    },
  );
}
