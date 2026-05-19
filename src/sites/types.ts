import type { ReactNode } from "react";

import type { PageMentionPresentationProps } from "@/shared/editor/presentation/page-mention";
import type { OutlineItem } from "@/shared/editor/presentation/outline";
import type { EditorTextMetrics } from "@/shared/editor/schema/metrics";

export interface SiteIdentity {
  workspaceName: string;
  workspaceIcon: string | null;
  currentIsHome: boolean;
  homeHref: string;
}

export interface SiteNotFoundIdentity {
  workspaceName: string;
  workspaceIcon: string | null;
  homeHref: string;
}

export interface SiteDocumentAssets {
  stylesheetHref: string;
  fontStylesheetHref: string;
  scriptSrc: string | null;
  modulePreloadHrefs: string[];
}

export interface SitePageRenderState {
  title: string;
  icon: string | null;
  coverUrl: string | null;
  outline: OutlineItem[];
  metrics: EditorTextMetrics;
  description?: string | null;
  site: SiteIdentity;
  canonicalUrl: string;
}

export interface SitePageDocumentProps {
  children: ReactNode;
}

export interface NotFoundDocumentProps {
  site: SiteNotFoundIdentity | null;
  assets: SiteDocumentAssets;
}

export interface ApexDocumentProps {
  assets: SiteDocumentAssets;
}

export type SitesPageMentionRenderInfo = Pick<PageMentionPresentationProps, "ariaLabel" | "href" | "icon" | "kind"> & {
  label: string;
};

export type SitesPageMentionResolver = (pageId: string) => SitesPageMentionRenderInfo;
