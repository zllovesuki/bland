import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import { api, refreshSession } from "@/client/lib/api";
import { docCache } from "@/client/lib/doc-cache-registry";
import { reconcileDocSyncProvider } from "@/client/lib/doc-sync-provider";
import { reportClientError } from "@/client/lib/report-client-error";
import { useOnline } from "@/client/hooks/use-online";
import { useAuthStore } from "@/client/stores/auth-store";
import { YJS_PAGE_TITLE } from "@/shared/constants";

export type DocSyncBootstrapStatus = "pending" | "resolved" | "error";

export interface DocSyncPhaseInputs {
  hasLocalBodyState: boolean;
  wantsConnection: boolean;
  workspaceId: string | undefined;
  bootstrapStatus: DocSyncBootstrapStatus;
}

export interface DocSyncPhaseSnapshot {
  ready: boolean;
  shouldConnect: boolean;
  snapshotFetch: { workspaceId: string } | null;
  error: boolean;
}

// Cold-bootstrap rule: if the session mounts against an empty local Y.Doc,
// any mount-time local mutation can merge into the authoritative document
// before remote content arrives. So when wantsConnection && !hasLocalBodyState,
// fetch the persisted snapshot over HTTP before letting the provider connect.
// A missing snapshot means the server is empty, which is safe to mount against.
export function deriveDocSyncPhase(i: DocSyncPhaseInputs): DocSyncPhaseSnapshot {
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

export interface DocSyncRefreshDecisionInput {
  isOnline: boolean;
  isProviderActive: boolean;
  hasShareToken: boolean;
  currentAccessToken: string | null;
  lastRefreshAttemptedFor: string | null;
}

export type DocSyncRefreshDecision =
  | { kind: "skip"; reason: "share" | "offline" | "inactive" | "no_token" | "already_attempted" }
  | { kind: "refresh"; tokenAtAttempt: string };

// Reconnect-time refresh policy. The browser cannot read the HTTP 401 from a
// failed WS upgrade, so every authenticated `connection-close` is treated as
// potentially auth-related. The gate keys on the access-token value to avoid
// looping on the same stale token, while still allowing a future expiration
// of the rotated token to refresh again.
export function decideDocSyncRefresh(i: DocSyncRefreshDecisionInput): DocSyncRefreshDecision {
  if (!i.isOnline) return { kind: "skip", reason: "offline" };
  if (!i.isProviderActive) return { kind: "skip", reason: "inactive" };
  if (i.hasShareToken) return { kind: "skip", reason: "share" };
  if (!i.currentAccessToken) return { kind: "skip", reason: "no_token" };
  if (i.lastRefreshAttemptedFor === i.currentAccessToken) {
    return { kind: "skip", reason: "already_attempted" };
  }
  return { kind: "refresh", tokenAtAttempt: i.currentAccessToken };
}

export interface DocSyncSessionOptions<TRuntime> {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  enabled?: boolean;
  /** IDB cache key for this session; must be stable for a given pageId. */
  cacheKey: string;
  /** Reporting label for snapshot fetch failures. */
  errorSource: string;
  /** Projects the doc-specific Y roots from the Y.Doc. */
  roots: (ydoc: Y.Doc) => TRuntime;
  /** Returns true when `runtime` has body content worth mounting against. */
  hasBody: (runtime: TRuntime) => boolean;
}

interface DocSyncSessionBase {
  title: string;
  onTitleInput: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export interface DocSyncSessionLoadingState extends DocSyncSessionBase {
  kind: "loading";
}

export type DocSyncSessionReadyState<TRuntime> = DocSyncSessionBase & {
  kind: "ready";
  ydoc: Y.Doc;
  provider: YProvider;
} & TRuntime;

export interface DocSyncSessionErrorState extends DocSyncSessionBase {
  kind: "error";
  onRetry: () => void;
}

export type DocSyncSessionState<TRuntime> =
  | DocSyncSessionLoadingState
  | DocSyncSessionReadyState<TRuntime>
  | DocSyncSessionErrorState;

export function useDocSyncSession<TRuntime extends object>({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  enabled = true,
  cacheKey,
  errorSource,
  roots,
  hasBody,
}: DocSyncSessionOptions<TRuntime>): DocSyncSessionState<TRuntime> {
  const online = useOnline();
  const isAuthed = useAuthStore((s) => !!s.accessToken);
  const wantsConnection = online && (!!shareToken || isAuthed);
  const sessionKey = `${cacheKey}:${shareToken ?? ""}`;

  const [titleState, setTitleState] = useState(() => ({ key: sessionKey, title: initialTitle }));
  const [runtimeState, setRuntimeState] = useState<{
    key: string;
    runtime: { ydoc: Y.Doc; provider: YProvider } & TRuntime;
  } | null>(null);
  const [hasCachedBodyState, setHasCachedBodyState] = useState(() => ({ key: sessionKey, value: false }));
  const [bootstrapState, setBootstrapState] = useState<{ key: string; status: DocSyncBootstrapStatus }>(() => ({
    key: sessionKey,
    status: "pending",
  }));

  const title = titleState.key === sessionKey ? titleState.title : initialTitle;
  const runtime = enabled && runtimeState?.key === sessionKey ? runtimeState.runtime : null;
  const hasCachedBody = enabled && hasCachedBodyState.key === sessionKey ? hasCachedBodyState.value : false;
  const bootstrapStatus = enabled && bootstrapState.key === sessionKey ? bootstrapState.status : "pending";

  const readInitialTitle = useEffectEvent(() => initialTitle);
  const emitTitleChange = useEffectEvent((nextTitle: string) => {
    onTitleChange?.(nextTitle);
  });
  const emitProvider = useEffectEvent((provider: YProvider | null) => {
    onProvider?.(provider);
  });
  const readWantsConnection = useEffectEvent(() => wantsConnection);
  const readOnline = useEffectEvent(() => online);
  const projectRoots = useEffectEvent((ydoc: Y.Doc) => roots(ydoc));
  const runtimeHasBody = useEffectEvent((runtime: TRuntime) => hasBody(runtime));
  const lastRefreshAttemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const currentSessionKey = sessionKey;
    const ydoc = new Y.Doc();
    const idb = new IndexeddbPersistence(cacheKey, ydoc);
    const projected = projectRoots(ydoc);
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
      setTitleState({ key: currentSessionKey, title: nextTitle });
      emitTitleChange(nextTitle);
    };
    titleText.observe(titleObserver);

    const maybeSeedTitle = () => {
      if (!mounted || seededTitle) return;
      seededTitle = true;
      if (seedTitleTimeout !== null) {
        window.clearTimeout(seedTitleTimeout);
        seedTitleTimeout = null;
      }
      const seed = readInitialTitle();
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

    const handleConnectionClose = () => {
      if (!mounted) return;
      const decision = decideDocSyncRefresh({
        isOnline: readOnline(),
        isProviderActive: readWantsConnection(),
        hasShareToken: !!shareToken,
        currentAccessToken: useAuthStore.getState().accessToken,
        lastRefreshAttemptedFor: lastRefreshAttemptedFor.current,
      });
      if (decision.kind !== "refresh") return;
      // Mark before the async call. Do NOT overwrite on success: a future
      // expiration of the rotated token must remain refreshable.
      lastRefreshAttemptedFor.current = decision.tokenAtAttempt;
      void refreshSession();
    };
    wsProvider.on("connection-close", handleConnectionClose);

    const handleIdbSync = () => {
      if (!mounted) return;
      const bodyReady = runtimeHasBody(projected);

      if (titleText.length > 0) {
        const nextTitle = titleText.toString();
        setTitleState({ key: currentSessionKey, title: nextTitle });
        emitTitleChange(nextTitle);
        docCache.mark(pageId);
      }

      setHasCachedBodyState({ key: currentSessionKey, value: bodyReady });
      emitProvider(wsProvider);
      setRuntimeState({ key: currentSessionKey, runtime: { ...projected, ydoc, provider: wsProvider } });

      if (!readWantsConnection()) {
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
      wsProvider.off("connection-close", handleConnectionClose);
      emitProvider(null);
      wsProvider.destroy();
      idb.destroy();
      ydoc.destroy();
    };
  }, [enabled, pageId, shareToken, cacheKey, sessionKey]);

  const phase = deriveDocSyncPhase({
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
        setBootstrapState({ key: sessionKey, status: "resolved" });
      })
      .catch((error) => {
        if (controller.signal.aborted || cancelled) return;
        reportClientError({
          source: errorSource,
          error,
          context: {
            pageId,
            workspaceId: snapshotWorkspaceId,
            hasShareToken: !!shareToken,
          },
        });
        setBootstrapState({ key: sessionKey, status: "error" });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runtime, snapshotWorkspaceId, pageId, shareToken, errorSource, sessionKey]);

  useEffect(() => {
    if (!runtime) return;
    reconcileDocSyncProvider(runtime.provider, phase.shouldConnect);
  }, [runtime, phase.shouldConnect]);

  const onTitleInput = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextTitle = event.target.value;
      setTitleState({ key: sessionKey, title: nextTitle });
      if (!runtime) return;

      const titleText = runtime.ydoc.getText(YJS_PAGE_TITLE);
      runtime.ydoc.transact(() => {
        titleText.delete(0, titleText.length);
        titleText.insert(0, nextTitle);
      });
    },
    [runtime, sessionKey],
  );

  const retrySnapshot = useCallback(() => {
    setBootstrapState({ key: sessionKey, status: "pending" });
  }, [sessionKey]);

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
  } as DocSyncSessionReadyState<TRuntime>;
}
