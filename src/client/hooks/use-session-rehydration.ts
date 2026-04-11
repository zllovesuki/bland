import { useEffect } from "react";
import { requestSessionRefresh } from "@/client/lib/api";
import { SESSION_MODES } from "@/client/lib/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore, type WorkspaceAccessMode } from "@/client/stores/workspace-store";
import { useOnline } from "./use-online";
import { api } from "@/client/lib/api";
import type { Page, WorkspaceMember } from "@/shared/types";

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
          const { activeWorkspaceId: targetWorkspaceId, activeAccessMode: targetAccessMode } =
            useWorkspaceStore.getState();
          if (targetWorkspaceId && targetAccessMode) {
            try {
              const fetchMode: WorkspaceAccessMode = targetAccessMode;
              let pages: Page[];
              let members: WorkspaceMember[];

              if (fetchMode === "shared") {
                pages = await api.pages.list(targetWorkspaceId);
                members = [];
              } else {
                [pages, members] = await Promise.all([
                  api.pages.list(targetWorkspaceId),
                  api.workspaces.members(targetWorkspaceId),
                ]);
              }

              if (!cancelled) {
                const latestStore = useWorkspaceStore.getState();
                if (
                  latestStore.activeWorkspaceId !== targetWorkspaceId ||
                  latestStore.activeAccessMode !== targetAccessMode
                ) {
                  return;
                }

                const snap = latestStore.snapshotsByWorkspaceId[targetWorkspaceId];
                if (snap) {
                  latestStore.replaceWorkspaceSnapshot(targetWorkspaceId, { ...snap, pages, members });
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
