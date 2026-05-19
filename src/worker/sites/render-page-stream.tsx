import { renderToReadableStream } from "react-dom/server";

import type { Db } from "@/worker/db/d1/client";
import type { ResolvedPublishedPage, ResolvedSite } from "@/worker/lib/published-pages";
import { buildSitePagePath } from "@/worker/lib/site-public-url";
import { renderBlandSitesDocumentToReactElement } from "@/sites/static-renderer";
import { collectSitesOutline } from "@/sites/static-renderer/outline";
import { preWalkSitesJson } from "@/sites/json-prewalk";
import { extractSiteDescription } from "@/sites/excerpt";
import { SitePageDocument } from "@/sites/document";
import { runWithSitesReactRenderContext, type SitesReactRenderContext } from "@/sites/react-render-context";
import type { SitesPageMentionRenderInfo } from "@/sites/types";
import type { PreparedSitePageRender } from "@/worker/sites/prepare-page-render";

const UPLOAD_PATH = /^\/uploads\/([A-Za-z0-9_-]+)$/;

export interface RenderSitePageDocumentStreamArgs {
  env: Pick<Env, "DocSync" | "SITES" | "ASSETS">;
  db: Db;
  site: ResolvedSite;
  page: ResolvedPublishedPage;
  prepared: PreparedSitePageRender;
}

export async function renderSitePageDocumentStream(
  args: RenderSitePageDocumentStreamArgs,
): Promise<ReadableStream<Uint8Array>> {
  const { site, page, prepared } = args;
  const renderContent = structuredClone(prepared.pmJson.content);
  preWalkSitesJson(renderContent, { pageId: page.id, mentions: prepared.mentions });
  const description = extractSiteDescription(renderContent);

  const outline = collectSitesOutline(renderContent);
  const context: SitesReactRenderContext = {
    kind: "page",
    assets: prepared.assets,
    headingAnchorIds: outline.headingAnchorIds,
    resolvePageMention: (pageId) => buildMentionRenderInfo(pageId, prepared.mentions),
    page: {
      title: page.title || "Untitled",
      icon: page.icon,
      coverUrl: rewriteSiteCoverUrl(page.cover_url, page.id),
      outline: outline.items,
      metrics: prepared.pmJson.metrics,
      description,
      canonicalUrl: prepared.canonicalUrl,
      site: {
        workspaceName: site.workspace_name,
        workspaceIcon: site.workspace_icon,
        currentIsHome: prepared.currentIsHome,
        homeHref: "/",
      },
    },
  };

  return runWithSitesReactRenderContext(context, () => {
    const bodyContent = renderBlandSitesDocumentToReactElement(renderContent);
    return renderToReadableStream(
      <SitePageDocument>{bodyContent}</SitePageDocument>,
      prepared.assets.scriptSrc ? { bootstrapModules: [prepared.assets.scriptSrc] } : undefined,
    );
  });
}

function buildMentionRenderInfo(
  pageId: string,
  mentions: Map<string, { reachable: boolean; title: string | null; icon: string | null }>,
): SitesPageMentionRenderInfo {
  const entry = mentions.get(pageId);
  if (!entry || !entry.reachable) {
    return { label: "Restricted", href: null, kind: "restricted" };
  }
  return {
    label: entry.title ?? "Untitled",
    href: buildSitePagePath(pageId, entry.title ?? ""),
    icon: entry.icon,
    kind: "accessible",
  };
}

export function rewriteSiteCoverUrl(cover: string | null, pageId: string): string | null {
  if (!cover) return null;
  if (cover.startsWith("linear-gradient(")) return cover;
  const match = UPLOAD_PATH.exec(cover);
  if (match) return `/_assets/${pageId}/${match[1]}`;
  return cover;
}
