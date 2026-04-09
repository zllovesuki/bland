import { useEffect } from "react";
import { requestSessionRefresh } from "@/client/lib/api";
import { SESSION_MODES } from "@/client/lib/constants";
import { bootstrapWorkspaceData } from "@/client/lib/workspace-data";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useOnline } from "./use-online";

/**
 * When the user transitions from local-only back to online,
 * attempt to restore a live server session and refresh workspace data
 * in the background.
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

          // Background re-bootstrap: refresh workspace data without blocking UI.
          // Branch by access mode the same way route loaders do —
          // shared-access users can list pages but not members.
          const store = useWorkspaceStore.getState();
          if (store.currentWorkspace) {
            const accessMode = store.accessMode === "shared" ? "shared" : "member";
            bootstrapWorkspaceData(store, store.currentWorkspace.id, accessMode, () => cancelled).catch(() => {});
          }
        } else {
          // Server reachable, session definitively dead
          useAuthStore.getState().markExpired();
        }
      } catch {
        // Still can't reach server — stay in local-only
      }
    }

    rehydrate();
    return () => {
      cancelled = true;
    };
  }, [online, sessionMode]);
}
