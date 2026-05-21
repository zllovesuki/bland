import { useCallback } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";
import { resetWorkspaceLocalOwner } from "@/client/stores/bootstrap";
import { api } from "@/client/lib/api";

export function useAuth() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore errors - clear local state regardless
    }
    clearAuth();
    await resetWorkspaceLocalOwner();
  }, [clearAuth]);

  return { isAuthenticated, user, logout };
}
