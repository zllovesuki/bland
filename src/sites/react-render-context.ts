/// <reference types="node" />

import { AsyncLocalStorage } from "node:async_hooks";

import type {
  ApexDocumentProps,
  NotFoundDocumentProps,
  SiteDocumentAssets,
  SiteIdentity,
  SiteNotFoundIdentity,
  SitePageRenderState,
  SitesPageMentionResolver,
} from "./types";

export type SitesReactRenderContext =
  | {
      kind: "page";
      assets: SiteDocumentAssets;
      page: SitePageRenderState;
      headingAnchorIds: readonly (string | null)[];
      resolvePageMention: SitesPageMentionResolver;
    }
  | {
      kind: "not-found";
      assets: SiteDocumentAssets;
      site: SiteNotFoundIdentity | null;
    }
  | {
      kind: "apex";
      assets: SiteDocumentAssets;
    };

export type SitesHeaderRenderState = SiteIdentity;

const sitesReactRenderContext = new AsyncLocalStorage<SitesReactRenderContext>();

export function runWithSitesReactRenderContext<T>(context: SitesReactRenderContext, callback: () => T): T {
  return sitesReactRenderContext.run(context, callback);
}

export function readOptionalSitesReactRenderContext(): SitesReactRenderContext | undefined {
  return sitesReactRenderContext.getStore();
}

export function readRequiredSitesReactRenderContext(): SitesReactRenderContext {
  const context = readOptionalSitesReactRenderContext();
  if (!context) {
    throw new Error("Sites React render context is required for Sites SSR components");
  }
  return context;
}

export function readSitesPageRenderState(): { assets: SiteDocumentAssets; page: SitePageRenderState } {
  const context = readRequiredSitesReactRenderContext();
  if (context.kind !== "page") {
    throw new Error("Sites page render context is required for SitePageDocument");
  }
  return { assets: context.assets, page: context.page };
}

export function readSitesDocumentAssets(): SiteDocumentAssets {
  return readRequiredSitesReactRenderContext().assets;
}

export function readSitesHeaderRenderState(): SitesHeaderRenderState | null {
  const context = readRequiredSitesReactRenderContext();

  if (context.kind === "page") {
    return context.page.site;
  }
  if (context.kind === "not-found" && context.site) {
    return { ...context.site, currentIsHome: false };
  }
  return null;
}

export function createSitesNotFoundRenderContext(props: NotFoundDocumentProps): SitesReactRenderContext {
  return { kind: "not-found", assets: props.assets, site: props.site };
}

export function createSitesApexRenderContext(props: ApexDocumentProps): SitesReactRenderContext {
  return { kind: "apex", assets: props.assets };
}
