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
import { reportClientError } from "@/client/lib/report-client-error";
import { toast } from "@/client/components/toast";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { EditorTitle } from "./editor-title";
import { EditorBody } from "./editor-body";

const INVALID_SCHEMA_MESSAGE = "This page contains content this editor version can't safely load. Refresh to update.";

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
  const [schemaError, setSchemaError] = useState<Error | null>(null);
  const schemaErrorReportedRef = useRef(false);

  const initialTitleRef = useRef(initialTitle);
  initialTitleRef.current = initialTitle;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onProviderRef = useRef(onProvider);
  onProviderRef.current = onProvider;

  useEffect(() => {
    setSchemaError(null);
    schemaErrorReportedRef.current = false;
  }, [pageId, shareToken]);

  useEffect(() => {
    if (schemaError) return;

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
  }, [pageId, schemaError, shareToken]);

  const handleSchemaError = useCallback(
    (error: Error) => {
      setEditorState(null);
      setSchemaError((current) => current ?? error);

      if (schemaErrorReportedRef.current) return;
      schemaErrorReportedRef.current = true;

      reportClientError({
        source: "editor.invalid-schema",
        error,
        context: {
          pageId,
          workspaceId,
          hasShareToken: !!shareToken,
          readOnly: !!readOnly,
        },
      });
      toast.error(INVALID_SCHEMA_MESSAGE);
    },
    [pageId, readOnly, shareToken, workspaceId],
  );

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
      <EditorTitle
        title={title}
        onInput={handleTitleInput}
        disabled={!editorState || !!schemaError}
        readOnly={readOnly || !!schemaError}
      />

      {schemaError ? (
        <PageErrorState
          message={INVALID_SCHEMA_MESSAGE}
          className="min-h-[12rem]"
          action={{ label: "Reload", onClick: () => window.location.reload() }}
        />
      ) : editorState ? (
        <>
          <EditorBody
            fragment={editorState.fragment}
            provider={editorState.provider}
            pageId={pageId}
            readOnly={readOnly}
            shareToken={shareToken}
            workspaceId={workspaceId}
            onSchemaError={handleSchemaError}
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
