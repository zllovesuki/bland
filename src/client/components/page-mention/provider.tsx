import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageMentionContext } from "./context";
import { createPageMentionResolver } from "./resolver";
import type { PageMentionCacheMode, PageMentionCachedPage, PageMentionCandidate } from "./types";

interface PageMentionProviderProps {
  children: ReactNode;
  workspaceId: string | undefined;
  scopeKey: string | null;
  shareToken?: string;
  cacheMode: PageMentionCacheMode;
  networkEnabled: boolean;
  lookupCachedPage?: (pageId: string) => PageMentionCachedPage | null;
  getInsertablePages?: (excludePageId: string | undefined) => PageMentionCandidate[];
  navigate: (pageId: string) => void;
}

export function PageMentionProvider({
  children,
  workspaceId,
  scopeKey,
  shareToken,
  cacheMode,
  networkEnabled,
  lookupCachedPage,
  getInsertablePages,
  navigate,
}: PageMentionProviderProps) {
  const cacheModeRef = useRef(cacheMode);
  const networkEnabledRef = useRef(networkEnabled);
  const lookupCachedPageRef = useRef(lookupCachedPage);
  const getInsertablePagesRef = useRef(getInsertablePages);
  cacheModeRef.current = cacheMode;
  networkEnabledRef.current = networkEnabled;
  lookupCachedPageRef.current = lookupCachedPage;
  getInsertablePagesRef.current = getInsertablePages;

  const [resolver, setResolver] = useState<ReturnType<typeof createPageMentionResolver> | null>(null);

  useEffect(() => {
    if (!workspaceId || !scopeKey) {
      setResolver(null);
      return;
    }

    const nextResolver = createPageMentionResolver({
      workspaceId,
      shareToken,
      getCacheMode: () => cacheModeRef.current,
      getNetworkEnabled: () => networkEnabledRef.current,
      lookupCachedPage: (pageId) => lookupCachedPageRef.current?.(pageId) ?? null,
    });
    nextResolver.syncCacheMode();
    setResolver(nextResolver);

    return () => {
      nextResolver.dispose();
    };
  }, [scopeKey, shareToken, workspaceId]);

  useEffect(() => {
    resolver?.syncCacheMode();
  }, [resolver, cacheMode, networkEnabled]);

  const value = useMemo(
    () => ({
      resolver,
      navigate,
      getInsertablePages: (excludePageId: string | undefined) => getInsertablePagesRef.current?.(excludePageId) ?? [],
    }),
    [navigate, resolver],
  );

  return <PageMentionContext.Provider value={value}>{children}</PageMentionContext.Provider>;
}
