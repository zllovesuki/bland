import { useEffect } from "react";
import { requestSessionRefresh } from "@/client/lib/api";
import { SESSION_MODES } from "@/client/lib/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore, selectActiveWorkspace, type WorkspaceAccessMode } from "@/client/stores/workspace-store";
import { useOnline } from "./use-online";
import { api } from "@/client/lib/api";

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
          const store = useWorkspaceStore.getState();
          const activeWsId = store.activeWorkspaceId;
          const accessMode = store.activeAccessMode;
          if (activeWsId && accessMode) {
            try {
              const fetchMode: WorkspaceAccessMode = accessMode;
              if (fetchMode === "shared") {
                const pages = await api.pages.list(activeWsId);
                if (!cancelled) {
                  const snap = store.snapshotsByWorkspaceId[activeWsId];
                  if (snap) {
                    store.replaceWorkspaceSnapshot(activeWsId, { ...snap, pages, members: [] });
                  }
                }
              } else {
                const [pages, members] = await Promise.all([
                  api.pages.list(activeWsId),
                  api.workspaces.members(activeWsId),
                ]);
                if (!cancelled) {
                  const snap = store.snapshotsByWorkspaceId[activeWsId];
                  if (snap) {
                    store.replaceWorkspaceSnapshot(activeWsId, { ...snap, pages, members });
                  }
                }
              }
            } catch {
              // Background refresh failed — stale cache is acceptable
            }
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
