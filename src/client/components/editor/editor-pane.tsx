import { useState, useEffect, useCallback, useRef } from "react";
import { Skeleton } from "@/client/components/ui/skeleton";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";
import { getCachedDocKey } from "@/client/lib/constants";
import { YJS_PAGE_TITLE, YJS_DOCUMENT_STORE } from "@/shared/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { markDocCached } from "@/client/lib/doc-cache-hints";
import { EditorTitle } from "./editor-title";
import { EditorBody } from "./editor-body";

interface EditorPaneProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  readOnly?: boolean;
  workspaceId?: string;
  /** DOM node for portalling the outline into a right-rail container (xl+). */
  outlinePortalTarget?: HTMLDivElement | null;
}

export function EditorPane({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  readOnly,
  workspaceId,
  outlinePortalTarget,
}: EditorPaneProps) {
  const [title, setTitle] = useState(initialTitle);
  const [editorState, setEditorState] = useState<{
    fragment: Y.XmlFragment;
    provider: { awareness: Awareness };
    ydoc: Y.Doc;
  } | null>(null);

  const initialTitleRef = useRef(initialTitle);
  initialTitleRef.current = initialTitle;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onProviderRef = useRef(onProvider);
  onProviderRef.current = onProvider;

  useEffect(() => {
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
      const t = titleText.toString();
      setTitle(t);
      onTitleChangeRef.current?.(t);
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

    function handleSync() {
      if (!mounted) return;

      if (titleText.length > 0) {
        setTitle(titleText.toString());
        onTitleChangeRef.current?.(titleText.toString());
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

      // Only use a timeout fallback when no WebSocket will connect.
      // When WS is expected, rely solely on the sync handler — avoids
      // racing a slow-but-incoming sync that carries the real title.
      if (!hasToken) {
        seedTitleTimeout = window.setTimeout(maybeSeedTitle, 2000);
      }

      // Reconnect when auth is restored after local-only mode
      if (!shareToken) {
        unsubAuth = useAuthStore.subscribe((state) => {
          if (state.accessToken && wsProvider && !wsProvider.wsconnected) {
            wsProvider.connect();
          }
        });
      }

      onProviderRef.current?.(wsProvider);
      setEditorState({ fragment, provider: wsProvider, ydoc });
    }

    if (idb.synced) {
      handleSync();
    } else {
      idb.on("synced", handleSync);
    }

    return () => {
      mounted = false;
      idb.off("synced", handleSync);
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
  }, [pageId, shareToken]);

  const handleTitleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      setTitle(newVal);
      if (!editorState) return;

      const titleText = editorState.ydoc.getText(YJS_PAGE_TITLE);
      editorState.ydoc.transact(() => {
        titleText.delete(0, titleText.length);
        titleText.insert(0, newVal);
      });
    },
    [editorState],
  );

  return (
    <div>
      <EditorTitle title={title} onInput={handleTitleInput} disabled={!editorState} readOnly={readOnly} />

      {editorState ? (
        <>
          <EditorBody
            fragment={editorState.fragment}
            provider={editorState.provider}
            pageId={pageId}
            readOnly={readOnly}
            shareToken={shareToken}
            workspaceId={workspaceId}
            outlinePortalTarget={outlinePortalTarget}
          />
        </>
      ) : (
        <div className="space-y-3 pl-7">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      )}
    </div>
  );
}
