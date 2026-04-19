import { useEffect } from "react";
import { refreshSession } from "@/client/lib/api";
import { SESSION_MODES } from "@/client/lib/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useOnline } from "./use-online";

/**
 * When the user transitions from local-only back to online,
 * attempt to restore a live server session.
 *
 * This hook does not perform background workspace refreshes after
 * LOCAL_ONLY -> AUTHENTICATED.
 */
export function useSessionRehydration() {
  const online = useOnline();
  const sessionMode = useAuthStore((s) => s.sessionMode);

  useEffect(() => {
    if (!online || sessionMode !== SESSION_MODES.LOCAL_ONLY) return;

    void refreshSession();
  }, [online, sessionMode]);
}
