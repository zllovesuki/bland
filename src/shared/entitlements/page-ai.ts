import type { EntitlementSurface, PageAccessLevel } from "@/shared/entitlements/common";

export interface PageAiEntitlements {
  useAiRewrite: boolean;
  useAiGenerate: boolean;
  summarizePage: boolean;
  askPage: boolean;
}

const PAGE_AI_TABLE: Record<EntitlementSurface, Record<PageAccessLevel, PageAiEntitlements>> = {
  canonical: {
    none: {
      useAiRewrite: false,
      useAiGenerate: false,
      summarizePage: false,
      askPage: false,
    },
    view: {
      useAiRewrite: false,
      useAiGenerate: false,
      summarizePage: true,
      askPage: true,
    },
    edit: {
      useAiRewrite: true,
      useAiGenerate: true,
      summarizePage: true,
      askPage: true,
    },
  },
  shared: {
    none: { useAiRewrite: false, useAiGenerate: false, summarizePage: false, askPage: false },
    view: { useAiRewrite: false, useAiGenerate: false, summarizePage: false, askPage: false },
    edit: { useAiRewrite: false, useAiGenerate: false, summarizePage: false, askPage: false },
  },
};

export function getPageAiEntitlements(surface: EntitlementSurface, pageAccess: PageAccessLevel): PageAiEntitlements {
  return PAGE_AI_TABLE[surface][pageAccess];
}
