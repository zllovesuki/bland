import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { MentionEntry, PageMentionResolver, PageMentionRouteContext } from "../lib/page-mention/resolver";

export type PageMentionNavigateTarget = { pageId: string } & PageMentionRouteContext;

export interface PageMentionContextValue {
  resolver: PageMentionResolver | null;
  navigate: (target: PageMentionNavigateTarget) => void;
}

export const PageMentionContext = createContext<PageMentionContextValue>({
  resolver: null,
  navigate: () => {},
});

const EMPTY_ENTRY: MentionEntry = { status: "pending", source: null, accessible: false, title: null, icon: null };

export function usePageMentionEntry(pageId: string | null): MentionEntry {
  const { resolver } = useContext(PageMentionContext);

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
  return useContext(PageMentionContext).navigate;
}

export function usePageMentionResolver() {
  return useContext(PageMentionContext).resolver;
}
