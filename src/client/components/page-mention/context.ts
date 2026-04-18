import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { MentionEntry, PageMentionResolver } from "./resolver";
import type { PageMentionCandidate } from "./types";

export interface PageMentionContextValue {
  resolver: PageMentionResolver | null;
  navigate: (pageId: string) => void;
  getInsertablePages: (excludePageId: string | undefined) => PageMentionCandidate[];
}

const EMPTY_ENTRY: MentionEntry = { status: "pending", source: null, accessible: false, title: null, icon: null };

export const PageMentionContext = createContext<PageMentionContextValue>({
  resolver: null,
  navigate: () => {},
  getInsertablePages: () => [],
});

export function usePageMentions(): PageMentionContextValue {
  return useContext(PageMentionContext);
}

export function usePageMentionEntry(pageId: string | null): MentionEntry {
  const { resolver } = usePageMentions();

  useEffect(() => {
    if (!resolver || !pageId) return;
    resolver.request(pageId);
  }, [resolver, pageId]);

  return useSyncExternalStore(
    (listener) => {
      if (!resolver || !pageId) return () => {};
      return resolver.subscribe(pageId, listener);
    },
    () => resolver?.get(pageId) ?? EMPTY_ENTRY,
    () => EMPTY_ENTRY,
  );
}

export function usePageMentionNavigate() {
  return usePageMentions().navigate;
}
