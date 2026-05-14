import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { PageMentionContext } from "./context";
import { createPageMentionResolver, type PageMentionResolver, type PageMentionResolverEnvironment } from "./resolver";
import type { PageMentionCacheMode, PageMentionCachedPage } from "./types";

interface PageMentionProviderProps {
  children: ReactNode;
  workspaceId: string | undefined;
  scopeKey: string | null;
  shareToken?: string;
  cacheMode: PageMentionCacheMode;
  networkEnabled: boolean;
  lookupCachedPage?: (pageId: string) => PageMentionCachedPage | null;
  navigate: (pageId: string) => void;
}

type ResolverSlotListener = () => void;

function createResolverSlot() {
  let current: PageMentionResolver | null = null;
  const listeners = new Set<ResolverSlotListener>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: ResolverSlotListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return current;
    },
    getServerSnapshot() {
      return null;
    },
    set(next: PageMentionResolver | null) {
      if (current === next) return;
      current = next;
      notify();
    },
    clear(expected: PageMentionResolver) {
      if (current !== expected) return;
      current = null;
      notify();
    },
  };
}

export function PageMentionProvider({
  children,
  workspaceId,
  scopeKey,
  shareToken,
  cacheMode,
  networkEnabled,
  lookupCachedPage,
  navigate,
}: PageMentionProviderProps) {
  const environment = useMemo<PageMentionResolverEnvironment>(
    () => ({
      cacheMode,
      networkEnabled,
      lookupCachedPage,
    }),
    [cacheMode, lookupCachedPage, networkEnabled],
  );
  const readEnvironment = useEffectEvent(() => environment);
  const [resolverSlot] = useState(createResolverSlot);
  const resolver = useSyncExternalStore(
    resolverSlot.subscribe,
    resolverSlot.getSnapshot,
    resolverSlot.getServerSnapshot,
  );

  useEffect(() => {
    if (!workspaceId || !scopeKey) {
      resolverSlot.set(null);
      return;
    }

    const nextResolver = createPageMentionResolver({
      workspaceId,
      shareToken,
      environment: readEnvironment(),
    });
    resolverSlot.set(nextResolver);
    return () => {
      resolverSlot.clear(nextResolver);
      nextResolver.dispose();
    };
  }, [resolverSlot, scopeKey, shareToken, workspaceId]);

  useEffect(() => {
    resolver?.setEnvironment(environment);
  }, [environment, resolver]);

  const value = useMemo(() => ({ resolver, navigate }), [navigate, resolver]);

  return <PageMentionContext.Provider value={value}>{children}</PageMentionContext.Provider>;
}
