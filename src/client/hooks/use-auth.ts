import { useCallback } from "react";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";
import type { LoginRequest } from "@/shared/types";

export function useAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await api.auth.login(data);
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
    // Clear workspace cache on explicit logout
    useWorkspaceStore.getState().resetWorkspaceState();
  }, [clearAuth]);

  return { isLoading: !bootstrapped, isAuthenticated, user, login, logout };
}
