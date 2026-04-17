import { useEffect } from "react";
import { requestSessionRefresh } from "@/client/lib/api";
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

    let cancelled = false;

    async function rehydrate() {
      try {
        const res = await requestSessionRefresh();
        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as {
            accessToken: string;
            user: import("@/shared/types").User;
          };
          useAuthStore.getState().setAuth(data.accessToken, data.user);
        } else {
          // Server reachable, session definitively dead
          useAuthStore.getState().markExpired();
        }
      } catch {
        // Still can't reach server -- stay in local-only
      }
    }

    rehydrate();
    return () => {
      cancelled = true;
    };
  }, [online, sessionMode]);
}
