import { createContext, use } from "react";

import type { ShareDialogShellValue, ShareLinkValue, SharePeopleValue, SitePublishValue } from "./types";

export const ShareDialogShellContext = createContext<ShareDialogShellValue | null>(null);
export const SharePeopleContext = createContext<SharePeopleValue | null>(null);
export const ShareLinkContext = createContext<ShareLinkValue | null>(null);
export const SitePublishContext = createContext<SitePublishValue | null>(null);

export function useShareDialogShell(): ShareDialogShellValue {
  const ctx = use(ShareDialogShellContext);
  if (!ctx) throw new Error("useShareDialogShell must be used inside ShareDialog");
  return ctx;
}

export function useSharePeople(): SharePeopleValue {
  const ctx = use(SharePeopleContext);
  if (!ctx) throw new Error("useSharePeople must be used inside ShareDialog");
  return ctx;
}

export function useShareLink(): ShareLinkValue {
  const ctx = use(ShareLinkContext);
  if (!ctx) throw new Error("useShareLink must be used inside ShareDialog");
  return ctx;
}

export function useSitePublish(): SitePublishValue {
  const ctx = use(SitePublishContext);
  if (!ctx) throw new Error("useSitePublish must be used inside ShareDialog");
  return ctx;
}
