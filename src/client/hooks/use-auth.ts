import { useCallback } from "react";
import { useAuthStore } from "@/client/stores/auth-store";
import { api } from "@/client/lib/api";
import type { LoginRequest } from "@/shared/types";

export function useAuth() {
  const { isAuthenticated, user, bootstrapped, setAuth, clearAuth } = useAuthStore();

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
  }, [clearAuth]);

  return { isLoading: !bootstrapped, isAuthenticated, user, login, logout };
}
