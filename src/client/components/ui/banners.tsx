import { Link, useLocation } from "@tanstack/react-router";
import { SESSION_MODES } from "@/client/lib/constants";
import { selectHasLocalSession, useAuthStore } from "@/client/stores/auth-store";
import { useOnline } from "@/client/hooks/use-online";
import { usePwaUpdate } from "@/client/lib/pwa";

export function Banners() {
  const online = useOnline();
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const refreshState = useAuthStore((s) => s.refreshState);
  const hasLocalSession = useAuthStore(selectHasLocalSession);
  const pathname = useLocation({ select: (l) => l.pathname });
  const pwaUpdate = usePwaUpdate();

  const hasDegradedSession = sessionMode === SESSION_MODES.LOCAL_ONLY || sessionMode === SESSION_MODES.EXPIRED;
  const showRestoring = refreshState === "refreshing" && hasDegradedSession;
  const showExpired = sessionMode === SESSION_MODES.EXPIRED && !showRestoring;
  // `Banners` is also mounted by `StandaloneLayout`, which covers anonymous
  // surfaces (login, invite). Gate the PWA update prompt to local-session
  // surfaces so unauthenticated users never see it.
  const showPwaUpdate = hasLocalSession && pwaUpdate.waiting && pwaUpdate.apply !== null;

  return (
    <>
      {!online && (
        <div
          role="status"
          aria-live="polite"
          className="animate-slide-up border-b border-amber-500/20 bg-amber-500/10 py-1.5 text-center text-xs text-amber-400"
        >
          Offline. Your edits are saved locally and will sync when you're back.
        </div>
      )}
      {showPwaUpdate && (
        <div
          role="status"
          aria-live="polite"
          className="animate-slide-up border-b border-accent-500/20 bg-accent-500/10 py-1.5 text-center text-xs text-accent-300"
        >
          A new version of bland is available.{" "}
          <button type="button" onClick={() => pwaUpdate.apply?.()} className="underline hover:text-accent-200">
            Reload to update
          </button>
        </div>
      )}
      {showRestoring && (
        <div
          role="status"
          aria-live="polite"
          className="animate-slide-up border-b border-zinc-700/60 bg-zinc-800/90 px-4 py-1.5 text-center text-xs text-zinc-300"
        >
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" aria-hidden="true" />
            Restoring your session in the background.
          </span>
        </div>
      )}
      {showExpired && (
        <div
          role="alert"
          className="animate-slide-up border-b border-red-500/20 bg-red-500/10 py-1.5 text-center text-xs text-red-400"
        >
          Session expired.{" "}
          <Link to="/login" search={{ redirect: pathname }} className="underline hover:text-red-300">
            Sign in
          </Link>{" "}
          to resume editing.
        </div>
      )}
    </>
  );
}
