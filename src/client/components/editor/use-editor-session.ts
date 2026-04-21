import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import { api } from "@/client/lib/api";
import { getCachedDocKey } from "@/client/lib/constants";
import { docCache } from "@/client/lib/doc-cache-registry";
import { reconcileDocSyncProvider } from "@/client/lib/doc-sync-provider";
import { reportClientError } from "@/client/lib/report-client-error";
import { useOnline } from "@/client/hooks/use-online";
import { useAuthStore } from "@/client/stores/auth-store";
import { YJS_DOCUMENT_STORE, YJS_PAGE_TITLE } from "@/shared/constants";

interface EditorSessionInternalState {
  fragment: Y.XmlFragment;
  provider: YProvider;
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

export interface EditorSessionErrorState extends EditorSessionBase {
  kind: "error";
  onRetry: () => void;
}

export type EditorSessionState = EditorSessionLoadingState | EditorSessionReadyState | EditorSessionErrorState;

interface UseEditorSessionOptions {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  enabled?: boolean;
}

export type EditorBootstrapStatus = "pending" | "resolved" | "error";

export interface EditorPhaseInputs {
  hasLocalBodyState: boolean;
  wantsConnection: boolean;
  workspaceId: string | undefined;
  bootstrapStatus: EditorBootstrapStatus;
}

export interface EditorPhaseSnapshot {
  ready: boolean;
  shouldConnect: boolean;
  snapshotFetch: { workspaceId: string } | null;
  error: boolean;
}

export function hasLocalBodyState(fragment: Pick<Y.XmlFragment, "length">): boolean {
  return fragment.length > 0;
}

// Cold-bootstrap rule: if the editor mounts against an empty local Y.Doc, any
// mount-time local mutation can merge into the authoritative document before
// remote content arrives. So when wantsConnection && !hasLocalBodyState, fetch
// the persisted snapshot over HTTP before letting the provider connect. A
// missing snapshot means the server is empty, which is safe to mount against.
export function deriveEditorPhase(i: EditorPhaseInputs): EditorPhaseSnapshot {
  if (!i.wantsConnection) {
    return { ready: true, shouldConnect: false, snapshotFetch: null, error: false };
  }
  if (i.hasLocalBodyState) {
    return { ready: true, shouldConnect: true, snapshotFetch: null, error: false };
  }
  if (!i.workspaceId) {
    return { ready: false, shouldConnect: false, snapshotFetch: null, error: false };
  }
  switch (i.bootstrapStatus) {
    case "pending":
      return { ready: false, shouldConnect: false, snapshotFetch: { workspaceId: i.workspaceId }, error: false };
    case "error":
      return { ready: false, shouldConnect: false, snapshotFetch: null, error: true };
    case "resolved":
      return { ready: true, shouldConnect: true, snapshotFetch: null, error: false };
  }
}

export function useEditorSession({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  enabled = true,
}: UseEditorSessionOptions): EditorSessionState {
  const online = useOnline();
  const isAuthed = useAuthStore((s) => !!s.accessToken);
  const wantsConnection = online && (!!shareToken || isAuthed);

  const [title, setTitle] = useState(initialTitle);
  const [runtime, setRuntime] = useState<EditorSessionInternalState | null>(null);
  const [hasCachedBody, setHasCachedBody] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<EditorBootstrapStatus>("pending");

  const initialTitleRef = useRef(initialTitle);
  initialTitleRef.current = initialTitle;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onProviderRef = useRef(onProvider);
  onProviderRef.current = onProvider;
  const wantsConnectionRef = useRef(wantsConnection);
  wantsConnectionRef.current = wantsConnection;

  useEffect(() => {
    setTitle(initialTitleRef.current);
    setRuntime(null);
    setHasCachedBody(false);
    setBootstrapStatus("pending");
  }, [pageId, shareToken]);

  useEffect(() => {
    if (!enabled) {
      setRuntime(null);
      setHasCachedBody(false);
      setBootstrapStatus("pending");
      return;
    }

    const ydoc = new Y.Doc();
    const idb = new IndexeddbPersistence(getCachedDocKey(pageId), ydoc);
    const fragment = ydoc.getXmlFragment(YJS_DOCUMENT_STORE);
    const titleText = ydoc.getText(YJS_PAGE_TITLE);
    const wsProvider = new YProvider(window.location.host, pageId, ydoc, {
      party: "doc-sync",
      connect: false,
      params: shareToken ? () => ({ share: shareToken }) : () => ({ token: useAuthStore.getState().accessToken || "" }),
    });

    let mounted = true;
    let seededTitle = false;
    let seedTitleTimeout: number | null = null;

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
      docCache.mark(pageId);
    };
    wsProvider.on("sync", handleProviderSync);

    const handleIdbSync = () => {
      if (!mounted) return;
      const bodyReady = hasLocalBodyState(fragment);

      if (titleText.length > 0) {
        const nextTitle = titleText.toString();
        setTitle(nextTitle);
        onTitleChangeRef.current?.(nextTitle);
        docCache.mark(pageId);
      }

      setHasCachedBody(bodyReady);
      onProviderRef.current?.(wsProvider);
      setRuntime({ fragment, provider: wsProvider, ydoc });

      if (!wantsConnectionRef.current) {
        seedTitleTimeout = window.setTimeout(maybeSeedTitle, 2000);
      }
    };

    if (idb.synced) {
      handleIdbSync();
    } else {
      idb.on("synced", handleIdbSync);
    }

    return () => {
      mounted = false;
      idb.off("synced", handleIdbSync);
      titleText.unobserve(titleObserver);
      if (seedTitleTimeout !== null) window.clearTimeout(seedTitleTimeout);
      wsProvider.off("sync", handleProviderSync);
      onProviderRef.current?.(null);
      wsProvider.destroy();
      idb.destroy();
      ydoc.destroy();
    };
  }, [enabled, pageId, shareToken]);

  const phase = deriveEditorPhase({
    hasLocalBodyState: hasCachedBody,
    wantsConnection,
    workspaceId,
    bootstrapStatus,
  });

  const snapshotWorkspaceId = phase.snapshotFetch?.workspaceId ?? null;
  useEffect(() => {
    if (!runtime || !snapshotWorkspaceId) return;

    const controller = new AbortController();
    let cancelled = false;

    void api.pages
      .snapshot(snapshotWorkspaceId, pageId, shareToken, controller.signal)
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "found") {
          Y.applyUpdate(runtime.ydoc, new Uint8Array(result.snapshot));
          docCache.mark(pageId);
        }
        setBootstrapStatus("resolved");
      })
      .catch((error) => {
        if (controller.signal.aborted || cancelled) return;
        reportClientError({
          source: "editor.snapshot-bootstrap",
          error,
          context: {
            pageId,
            workspaceId: snapshotWorkspaceId,
            hasShareToken: !!shareToken,
          },
        });
        setBootstrapStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runtime, snapshotWorkspaceId, pageId, shareToken]);

  useEffect(() => {
    if (!runtime) return;
    reconcileDocSyncProvider(runtime.provider, phase.shouldConnect);
  }, [runtime, phase.shouldConnect]);

  const onTitleInput = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextTitle = event.target.value;
      setTitle(nextTitle);
      if (!runtime) return;

      const titleText = runtime.ydoc.getText(YJS_PAGE_TITLE);
      runtime.ydoc.transact(() => {
        titleText.delete(0, titleText.length);
        titleText.insert(0, nextTitle);
      });
    },
    [runtime],
  );

  const retrySnapshot = useCallback(() => {
    setBootstrapStatus("pending");
  }, []);

  if (phase.error) {
    return {
      kind: "error",
      title,
      onTitleInput,
      onRetry: retrySnapshot,
    };
  }

  if (!runtime || !phase.ready) {
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
    ...runtime,
  };
}
