import { renderToReadableStream } from "react-dom/server";

import type { Db } from "@/worker/db/d1/client";
import type { ResolvedPublishedPage, ResolvedSite } from "@/worker/lib/published-pages";
import { buildSitePagePath } from "@/worker/lib/site-public-url";
import {
  renderBlandSitesDocumentToReactElement,
  type SitesPageMentionRenderInfo,
} from "@/sites/server/static-renderer";
import { collectSitesOutline } from "@/sites/server/static-renderer/outline";
import { preWalkSitesJson } from "@/sites/server/json-prewalk";
import { extractSiteDescription } from "@/sites/server/excerpt";
import { SitePageDocument } from "@/sites/server/document";
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
  const bodyContent = renderBlandSitesDocumentToReactElement(renderContent, {
    resolvePageMention: (pageId) => buildMentionRenderInfo(pageId, prepared.mentions),
    headingAnchorIds: outline.headingAnchorIds,
  });

  const documentNode = (
    <SitePageDocument
      title={page.title || "Untitled"}
      icon={page.icon}
      coverUrl={rewriteSiteCoverUrl(page.cover_url, page.id)}
      bodyContent={bodyContent}
      outline={outline.items}
      metrics={prepared.pmJson.metrics}
      description={description}
      site={{
        workspaceName: site.workspace_name,
        workspaceIcon: site.workspace_icon,
        currentIsHome: prepared.currentIsHome,
        homeHref: "/",
      }}
      canonicalUrl={prepared.canonicalUrl}
      assets={prepared.assets}
    />
  );

  return renderToReadableStream(
    documentNode,
    prepared.assets.scriptSrc ? { bootstrapModules: [prepared.assets.scriptSrc] } : undefined,
  );
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
