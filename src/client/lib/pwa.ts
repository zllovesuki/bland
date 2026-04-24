import { useSyncExternalStore } from "react";
import { Serwist } from "@serwist/window";

// Shell delivery uses `NetworkOnly` + precache fallback (see `vite.config.ts`),
// so there is no runtime shell cache to evict. Only user-content caches need
// to be cleared on logout / owner switch; app-code precaches are
// user-agnostic and stay.
const RUNTIME_CACHE_NAMES = ["bland-uploads-v1"];

type UpdateState = {
  waiting: boolean;
  apply: (() => void) | null;
};

const listeners = new Set<() => void>();
let state: UpdateState = { waiting: false, apply: null };
let sw: Serwist | null = null;

function emit(next: UpdateState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UpdateState {
  return state;
}

export function registerServiceWorker(): void {
  if (sw) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // The production build emits `/sw.js`; skip registration in dev so missing
  // or experimental service workers do not trip the global rejection handler.
  if (!import.meta.env.PROD) return;

  const instance = new Serwist("/sw.js", { scope: "/", type: "classic" });

  const apply = () => {
    instance.addEventListener("controlling", () => {
      window.location.reload();
    });
    instance.messageSkipWaiting();
  };

  instance.addEventListener("waiting", () => {
    emit({ waiting: true, apply });
  });

  sw = instance;
  void instance.register().catch(() => {
    // Registration can fail on stale browser engines or storage-blocked
    // profiles. Swallow so we do not surface a global unhandledrejection.
  });

  // Long-lived editor sessions otherwise would not notice a new deploy until
  // the browser's default 24h heuristic fires. Recheck on tab focus.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void instance.update().catch(() => {
          // Transient update failures are non-fatal; the next focus re-checks.
        });
      }
    });
  }
}

export function usePwaUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function clearPwaRuntimeCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await Promise.all(RUNTIME_CACHE_NAMES.map((name) => caches.delete(name)));
  } catch {
    // Cache Storage may be unavailable (private mode, storage pressure);
    // treat as best-effort so auth/local-owner resets stay robust.
  }
}
