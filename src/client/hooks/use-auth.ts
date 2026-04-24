import { useCallback } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";
import { ensureWorkspaceLocalOwner, resetWorkspaceLocalOwner } from "@/client/stores/bootstrap";
import { api } from "@/client/lib/api";
import type { LoginRequest } from "@/shared/types";

export function useAuth() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await api.auth.login(data);
      // Validate local owner and hydrate the workspace replica BEFORE
      // switching the session to authenticated, so route loaders never see
      // stale cache from a different user.
      await ensureWorkspaceLocalOwner(res.user.id, true);
      setAuth(res.accessToken, res.user);
    },
    [setAuth],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore errors - clear local state regardless
    }
    clearAuth();
    await resetWorkspaceLocalOwner();
  }, [clearAuth]);

  return { isAuthenticated, user, login, logout };
}
