import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";
import { getCachedDocKey } from "@/client/lib/constants";
import { markDocCached } from "@/client/lib/doc-cache-hints";
import { useAuthStore } from "@/client/stores/auth-store";
import { YJS_DOCUMENT_STORE, YJS_PAGE_TITLE } from "@/shared/constants";

interface EditorSessionInternalState {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  ydoc: Y.Doc;
}

interface EditorSessionBase {
  title: string;
  onTitleInput: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export interface EditorSessionLoadingState extends EditorSessionBase {
  kind: "loading";
}

export interface EditorSessionReadyState extends EditorSessionBase, EditorSessionInternalState {
  kind: "ready";
}

export type EditorSessionState = EditorSessionLoadingState | EditorSessionReadyState;

interface UseEditorSessionOptions {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  enabled?: boolean;
}

export function useEditorSession({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  enabled = true,
}: UseEditorSessionOptions): EditorSessionState {
  const [title, setTitle] = useState(initialTitle);
  const [session, setSession] = useState<EditorSessionInternalState | null>(null);

  const initialTitleRef = useRef(initialTitle);
  initialTitleRef.current = initialTitle;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onProviderRef = useRef(onProvider);
  onProviderRef.current = onProvider;

  useEffect(() => {
    setTitle(initialTitleRef.current);
    setSession(null);
  }, [pageId, shareToken]);

  useEffect(() => {
    if (!enabled) {
      setSession(null);
      return;
    }

    const ydoc = new Y.Doc();
    const idb = new IndexeddbPersistence(getCachedDocKey(pageId), ydoc);
    const fragment = ydoc.getXmlFragment(YJS_DOCUMENT_STORE);
    const titleText = ydoc.getText(YJS_PAGE_TITLE);
    let wsProvider: YProvider | null = null;
    let seedTitleTimeout: ReturnType<typeof window.setTimeout> | null = null;
    let unsubAuth: (() => void) | null = null;
    let mounted = true;
    let seededTitle = false;

    const titleObserver = () => {
      if (!mounted) return;
      const nextTitle = titleText.toString();
      setTitle(nextTitle);
      onTitleChangeRef.current?.(nextTitle);
    };
    titleText.observe(titleObserver);

    const maybeSeedTitle = () => {
      if (!mounted || seededTitle) return;
      seededTitle = true;
      if (seedTitleTimeout !== null) {
        window.clearTimeout(seedTitleTimeout);
        seedTitleTimeout = null;
      }

      const seed = initialTitleRef.current;
      if (titleText.length === 0 && seed) {
        titleText.insert(0, seed);
      }
    };

    const handleProviderSync = (isSynced: boolean) => {
      if (!isSynced) return;
      maybeSeedTitle();
      markDocCached(pageId);
    };

    function handleIndexedDbSync() {
      if (!mounted) return;

      if (titleText.length > 0) {
        const nextTitle = titleText.toString();
        setTitle(nextTitle);
        onTitleChangeRef.current?.(nextTitle);
        markDocCached(pageId);
      }

      const hasToken = !!shareToken || !!useAuthStore.getState().accessToken;
      wsProvider = new YProvider(window.location.host, pageId, ydoc, {
        party: "doc-sync",
        connect: hasToken,
        params: shareToken
          ? () => ({ share: shareToken })
          : () => ({ token: useAuthStore.getState().accessToken || "" }),
      });
      wsProvider.on("sync", handleProviderSync);

      if (!hasToken) {
        seedTitleTimeout = window.setTimeout(maybeSeedTitle, 2000);
      }

      if (!shareToken) {
        unsubAuth = useAuthStore.subscribe((state) => {
          if (state.accessToken && wsProvider && !wsProvider.wsconnected) {
            wsProvider.connect();
          }
        });
      }

      onProviderRef.current?.(wsProvider);
      setSession({ fragment, provider: wsProvider, ydoc });
    }

    if (idb.synced) {
      handleIndexedDbSync();
    } else {
      idb.on("synced", handleIndexedDbSync);
    }

    return () => {
      mounted = false;
      idb.off("synced", handleIndexedDbSync);
      titleText.unobserve(titleObserver);
      if (seedTitleTimeout !== null) {
        window.clearTimeout(seedTitleTimeout);
      }
      unsubAuth?.();
      wsProvider?.off("sync", handleProviderSync);
      onProviderRef.current?.(null);
      wsProvider?.destroy();
      idb.destroy();
      ydoc.destroy();
    };
  }, [enabled, pageId, shareToken]);

  const onTitleInput = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextTitle = event.target.value;
      setTitle(nextTitle);
      if (!session) return;

      const titleText = session.ydoc.getText(YJS_PAGE_TITLE);
      session.ydoc.transact(() => {
        titleText.delete(0, titleText.length);
        titleText.insert(0, nextTitle);
      });
    },
    [session],
  );

  if (!session) {
    return {
      kind: "loading",
      title,
      onTitleInput,
    };
  }

  return {
    kind: "ready",
    title,
    onTitleInput,
    ...session,
  };
}
