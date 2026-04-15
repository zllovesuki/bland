import { api } from "@/client/lib/api";
import { MAX_PAGE_MENTION_BATCH } from "@/shared/constants";
import type { ApiError, ResolvedPageMentionItem, ResolvedViewerContext } from "@/shared/types";
import type { WorkspaceRouteSource } from "@/client/stores/workspace-store";
import { canUseCachedPageMentionData } from "./resolver-config";

export type MentionEntryStatus = "pending" | "resolved";
export type MentionEntrySource = "server" | "cache" | null;

export interface MentionEntry {
  status: MentionEntryStatus;
  source: MentionEntrySource;
  accessible: boolean;
  title: string | null;
  icon: string | null;
}

type Listener = () => void;

interface ResolverOpts {
  workspaceId: string;
  shareToken: string | undefined;
  viewer: ResolvedViewerContext;
  getRouteSource: () => WorkspaceRouteSource;
  lookupCachedPage?: (pageId: string) => { title: string; icon: string | null } | null;
}

export type PageMentionRouteContext =
  | {
      routeKind: "canonical";
      workspaceSlug: string;
    }
  | {
      routeKind: "shared";
      workspaceSlug: null;
    };

export interface PageMentionResolver {
  get(pageId: string | null): MentionEntry;
  request(pageId: string | null): void;
  subscribe(pageId: string | null, listener: Listener): () => void;
  routeContext(): PageMentionRouteContext | null;
  syncPolicy(): void;
  dispose(): void;
}

const PENDING: MentionEntry = { status: "pending", source: null, accessible: false, title: null, icon: null };
const RETRY_DELAYS_MS = [1000, 2000, 5000] as const;

function isApiError(err: unknown): err is ApiError {
  return (
    !!err &&
    typeof err === "object" &&
    "error" in err &&
    typeof err.error === "string" &&
    "message" in err &&
    typeof err.message === "string"
  );
}

function shouldRetryMentionResolveError(err: unknown): boolean {
  if (!isApiError(err)) {
    return true;
  }

  if (err.error === "internal_error") {
    return true;
  }

  if (err.error !== "request_failed") {
    return false;
  }

  const match = /\bstatus (\d{3})\b/.exec(err.message);
  if (!match) {
    return true;
  }

  return Number(match[1]) >= 500;
}

function toRouteContext(viewer: ResolvedViewerContext): PageMentionRouteContext | null {
  if (viewer.route_kind === "shared") {
    return { routeKind: "shared", workspaceSlug: null };
  }
  if (!viewer.workspace_slug) {
    return null;
  }
  return { routeKind: "canonical", workspaceSlug: viewer.workspace_slug };
}

export function createPageMentionResolver(opts: ResolverOpts): PageMentionResolver {
  const entries = new Map<string, MentionEntry>();
  const listeners = new Map<string, Set<Listener>>();
  const pendingQueue = new Set<string>();
  const inflight = new Set<string>();
  let flushScheduled = false;
  let isFlushing = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelayIndex = 0;
  let epoch = 0;
  let disposed = false;
  const initialRouteContext = toRouteContext(opts.viewer);
  let routeContext: PageMentionRouteContext | null = initialRouteContext;

  function canUseCache() {
    return canUseCachedPageMentionData(opts.viewer, opts.getRouteSource());
  }

  function notify(pageId: string) {
    const set = listeners.get(pageId);
    if (!set) return;
    for (const fn of set) fn();
  }

  function setEntry(pageId: string, entry: MentionEntry) {
    if (disposed) return;
    entries.set(pageId, entry);
    notify(pageId);
  }

  function getCachedEntry(pageId: string): MentionEntry | null {
    if (!canUseCache()) return null;

    const cached = opts.lookupCachedPage?.(pageId);
    if (!cached) return null;

    return {
      status: "resolved",
      source: "cache",
      accessible: true,
      title: cached.title,
      icon: cached.icon,
    };
  }

  function clearRetryTimer() {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function resetRetryBackoff() {
    retryDelayIndex = 0;
    clearRetryTimer();
  }

  function takeNextBatch() {
    const batch: string[] = [];
    for (const id of pendingQueue) {
      if (inflight.has(id)) continue;
      batch.push(id);
      if (batch.length >= MAX_PAGE_MENTION_BATCH) break;
    }
    for (const id of batch) {
      pendingQueue.delete(id);
    }
    return batch;
  }

  function scheduleRetry() {
    if (disposed) return;
    if (retryTimer !== null) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryDelayIndex, RETRY_DELAYS_MS.length - 1)];
    retryDelayIndex = Math.min(retryDelayIndex + 1, RETRY_DELAYS_MS.length - 1);
    retryTimer = setTimeout(() => {
      if (disposed) return;
      retryTimer = null;
      scheduleFlush();
    }, delay);
  }

  function scheduleFlush() {
    if (disposed) return;
    clearRetryTimer();
    if (isFlushing) {
      flushScheduled = true;
      return;
    }
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      void flush();
    });
  }

  async function flush() {
    if (disposed || isFlushing) return;
    isFlushing = true;
    try {
      while (true) {
        const batch = takeNextBatch();
        if (batch.length === 0) break;

        const batchEpoch = epoch;
        for (const id of batch) inflight.add(id);

        try {
          const response = await api.pageMentions.resolve(opts.workspaceId, batch, opts.shareToken);
          if (disposed || batchEpoch !== epoch) {
            break;
          }

          resetRetryBackoff();
          routeContext = toRouteContext(response.viewer);

          const byId = new Map<string, ResolvedPageMentionItem>();
          for (const item of response.mentions) byId.set(item.page_id, item);

          for (const id of batch) {
            const item = byId.get(id);
            if (!item) {
              setEntry(id, { status: "resolved", source: "server", accessible: false, title: null, icon: null });
            } else {
              setEntry(id, {
                status: "resolved",
                source: "server",
                accessible: item.accessible,
                title: item.title,
                icon: item.icon,
              });
            }
          }
        } catch (err) {
          if (disposed || batchEpoch !== epoch) {
            break;
          }

          if (shouldRetryMentionResolveError(err)) {
            for (const id of batch) {
              pendingQueue.add(id);
            }
            scheduleRetry();
          } else {
            for (const id of batch) {
              setEntry(id, { status: "resolved", source: "server", accessible: false, title: null, icon: null });
            }
          }
          break;
        } finally {
          for (const id of batch) inflight.delete(id);
        }
      }
    } finally {
      isFlushing = false;
      if (!disposed && (flushScheduled || pendingQueue.size > 0) && retryTimer === null) {
        flushScheduled = false;
        queueMicrotask(() => {
          void flush();
        });
      }
    }
  }

  function syncPolicy() {
    if (disposed) return;

    let shouldFlush = false;

    for (const [pageId, entry] of entries) {
      if (entry.source === "server") continue;

      const cachedEntry = getCachedEntry(pageId);
      if (cachedEntry) {
        if (
          entry.source !== "cache" ||
          entry.title !== cachedEntry.title ||
          entry.icon !== cachedEntry.icon ||
          entry.accessible !== cachedEntry.accessible
        ) {
          setEntry(pageId, cachedEntry);
        }
        shouldFlush = true;
        pendingQueue.add(pageId);
        continue;
      }

      if (entry.source === "cache") {
        shouldFlush = true;
        pendingQueue.add(pageId);
      }
    }

    if (shouldFlush) {
      scheduleFlush();
    }
  }

  return {
    get(pageId) {
      if (!pageId) return PENDING;
      return entries.get(pageId) ?? PENDING;
    },
    request(pageId) {
      if (!pageId || disposed) return;
      const existing = entries.get(pageId);
      const cachedEntry = getCachedEntry(pageId);

      if (!existing) {
        if (cachedEntry) {
          setEntry(pageId, cachedEntry);
        } else {
          entries.set(pageId, PENDING);
        }
      } else if (existing.source !== "server" && cachedEntry) {
        setEntry(pageId, cachedEntry);
      }

      if (inflight.has(pageId)) return;
      pendingQueue.add(pageId);
      scheduleFlush();
    },
    subscribe(pageId, listener) {
      if (!pageId || disposed) return () => {};
      let set = listeners.get(pageId);
      if (!set) {
        set = new Set();
        listeners.set(pageId, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set && set.size === 0) listeners.delete(pageId);
      };
    },
    routeContext() {
      return routeContext;
    },
    syncPolicy,
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch += 1;
      pendingQueue.clear();
      inflight.clear();
      isFlushing = false;
      flushScheduled = false;
      routeContext = initialRouteContext;
      resetRetryBackoff();
      listeners.clear();
    },
  };
}
