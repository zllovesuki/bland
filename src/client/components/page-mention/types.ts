export type PageMentionCacheMode = "live" | "cache";

export interface PageMentionCandidate {
  pageId: string;
  title: string;
  icon: string | null;
}

export interface PageMentionCachedPage {
  title: string;
  icon: string | null;
}
