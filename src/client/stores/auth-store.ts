import { create } from "zustand";
import type { User } from "@/shared/types";
import { SESSION_MODES, STORAGE_KEYS, type SessionMode } from "@/client/lib/constants";
import { useWorkspaceStore } from "./workspace-store";

interface AuthState {
  accessToken: string | null;
  user: User | null;
  sessionMode: SessionMode;
  bootstrapped: boolean;
  /** True when the user has a confirmed server session. */
  isAuthenticated: boolean;
  /** True when there is enough local state to render cached workspace UI. */
  hasLocalSession: boolean;
  setAuth(token: string, user: User): void;
  /** Full clear -- only on explicit logout. */
  clearAuth(): void;
  /** Drop remote auth but keep cached user identity. */
  markExpired(): void;
  setUser(user: User): void;
  setSessionMode(mode: SessionMode): void;
  setBootstrapped(): void;
}

const storedUser = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
})();

function deriveFlags(mode: SessionMode) {
  return {
    isAuthenticated: mode === SESSION_MODES.AUTHENTICATED,
    hasLocalSession:
      mode === SESSION_MODES.AUTHENTICATED || mode === SESSION_MODES.LOCAL_ONLY || mode === SESSION_MODES.EXPIRED,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: storedUser,
  sessionMode: SESSION_MODES.RESTORING,
  bootstrapped: false,
  isAuthenticated: false,
  hasLocalSession: false,

  setAuth(token, user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    useWorkspaceStore.getState().validateCacheOwner(user.id);
    set({
      accessToken: token,
      user,
      sessionMode: SESSION_MODES.AUTHENTICATED,
      ...deriveFlags(SESSION_MODES.AUTHENTICATED),
    });
  },

  clearAuth() {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.CACHED_DOCS);
    set({
      accessToken: null,
      user: null,
      sessionMode: SESSION_MODES.ANONYMOUS,
      ...deriveFlags(SESSION_MODES.ANONYMOUS),
    });
  },

  markExpired() {
    set((state) => ({
      accessToken: null,
      sessionMode: SESSION_MODES.EXPIRED,
      ...deriveFlags(SESSION_MODES.EXPIRED),
      user: state.user,
    }));
  },

  setUser(user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ user });
  },

  setSessionMode(mode) {
    set({ sessionMode: mode, ...deriveFlags(mode) });
  },

  setBootstrapped() {
    set({ bootstrapped: true });
  },
}));
