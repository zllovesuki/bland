import { Link, useLocation } from "@tanstack/react-router";
import { SESSION_MODES } from "@/client/lib/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useOnline } from "@/client/hooks/use-online";

export function Banners() {
  const online = useOnline();
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const pathname = useLocation({ select: (l) => l.pathname });

  return (
    <>
      {!online && (
        <div className="animate-slide-up border-b border-amber-500/20 bg-amber-500/10 py-1.5 text-center text-xs text-amber-400">
          Offline. Your edits are saved locally and will sync when you're back.
        </div>
      )}
      {sessionMode === SESSION_MODES.EXPIRED && (
        <div className="animate-slide-up border-b border-red-500/20 bg-red-500/10 py-1.5 text-center text-xs text-red-400">
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
