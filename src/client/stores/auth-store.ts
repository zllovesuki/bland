import { create } from "zustand";
import type { User } from "@/shared/types";
import { SESSION_MODES, STORAGE_KEYS, type SessionMode } from "@/client/lib/constants";
import { useWorkspaceStore } from "./workspace-store";

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  sessionMode: SessionMode;
  bootstrapped: boolean;
  setAuth(token: string, user: User): void;
  /** Full clear -- only on explicit logout. */
  clearAuth(): void;
  /** Drop remote auth but keep cached user identity. */
  markExpired(): void;
  setUser(user: User): void;
  setSessionMode(mode: SessionMode): void;
  setBootstrapped(): void;
}

export const selectIsAuthenticated = (s: AuthState): boolean => s.sessionMode === SESSION_MODES.AUTHENTICATED;

export const selectHasLocalSession = (s: AuthState): boolean =>
  s.sessionMode === SESSION_MODES.AUTHENTICATED ||
  s.sessionMode === SESSION_MODES.LOCAL_ONLY ||
  s.sessionMode === SESSION_MODES.EXPIRED;

const storedUser = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
})();

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: storedUser,
  sessionMode: SESSION_MODES.ANONYMOUS,
  bootstrapped: false,

  setAuth(token, user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    useWorkspaceStore.getState().validateCacheOwner(user.id);
    set({
      accessToken: token,
      user,
      sessionMode: SESSION_MODES.AUTHENTICATED,
    });
  },

  clearAuth() {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.CACHED_DOCS);
    set({
      accessToken: null,
      user: null,
      sessionMode: SESSION_MODES.ANONYMOUS,
    });
  },

  markExpired() {
    set((state) => ({
      accessToken: null,
      sessionMode: SESSION_MODES.EXPIRED,
      user: state.user,
    }));
  },

  setUser(user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ user });
  },

  setSessionMode(mode) {
    set({ sessionMode: mode });
  },

  setBootstrapped() {
    set({ bootstrapped: true });
  },
}));
