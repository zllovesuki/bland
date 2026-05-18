import type { Db } from "@/worker/db/d1/client";
import {
  resolvePublishedMentions,
  type ResolvedMention,
  type ResolvedPublishedPage,
} from "@/worker/lib/published-pages";
import { collectMentionPageIds } from "@/sites/server/json-prewalk";
import type { SiteDocumentAssets } from "@/sites/server/document";
import type { LoadedPmJson } from "@/worker/sites/load-page-pm-json";
import { resolveSitesDocumentAssets } from "@/worker/sites/manifest";

type SiteTiming = <T>(name: string, operation: () => Promise<T>) => Promise<T>;

export interface PreparedSitePageRender {
  pmJson: LoadedPmJson;
  mentionIds: string[];
  mentions: Map<string, ResolvedMention>;
  assets: SiteDocumentAssets;
  canonicalUrl: string;
  canonicalPath: string;
  currentIsHome: boolean;
}

export interface PrepareSitePageRenderArgs {
  env: Pick<Env, "ASSETS">;
  db: Db;
  timings: SiteTiming;
  page: ResolvedPublishedPage;
  pmJson: LoadedPmJson;
  currentIsHome: boolean;
  canonicalPath: string;
  canonicalUrl: string;
}

export async function prepareSitePageRender({
  env,
  db,
  timings,
  page,
  pmJson,
  currentIsHome,
  canonicalPath,
  canonicalUrl,
}: PrepareSitePageRenderArgs): Promise<PreparedSitePageRender | null> {
  const assets = await timings("asset_manifest", () => resolveSitesDocumentAssets(env));
  if (!assets) return null;

  const mentionIds = collectMentionPageIds(pmJson.content);
  const mentions = await timings("mention_resolution", () =>
    resolvePublishedMentions(db, page.workspace_id, mentionIds),
  );

  return {
    pmJson,
    mentionIds,
    mentions,
    assets,
    canonicalUrl,
    canonicalPath,
    currentIsHome,
  };
}
