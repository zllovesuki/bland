import { create } from "zustand";
import { User as UserSchema, type User } from "@/shared/types";
import { SESSION_MODES, STORAGE_KEYS, type SessionMode } from "@/client/lib/constants";
import { docCache } from "@/client/lib/doc-cache-registry";
import { queryClient } from "@/client/lib/query-client";
import { readVersionedStorageJson, writeVersionedStorageJson, removeStorageItem } from "@/client/lib/storage";
import { useWorkspaceStore } from "./workspace-store";

const STORED_USER_VERSION = 1;

export type SessionRefreshState = "idle" | "refreshing";

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  sessionMode: SessionMode;
  refreshState: SessionRefreshState;
  setAuth(token: string, user: User): void;
  /** Full clear -- only on explicit logout. */
  clearAuth(): void;
  /** Drop remote auth but keep cached user identity. */
  markExpired(): void;
  /** Drop live auth but keep cached user identity for offline surfaces. */
  markLocalOnly(): void;
  setUser(user: User): void;
  setSessionMode(mode: SessionMode): void;
  setRefreshState(state: SessionRefreshState): void;
}

export const selectIsAuthenticated = (s: AuthState): boolean => s.sessionMode === SESSION_MODES.AUTHENTICATED;

export const selectHasLocalSession = (s: AuthState): boolean =>
  s.sessionMode === SESSION_MODES.AUTHENTICATED ||
  s.sessionMode === SESSION_MODES.LOCAL_ONLY ||
  s.sessionMode === SESSION_MODES.EXPIRED;

const storedUser = (() => {
  return readVersionedStorageJson(STORAGE_KEYS.USER, STORED_USER_VERSION, (value) => {
    const parsed = UserSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  });
})();

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: storedUser,
  sessionMode: storedUser ? SESSION_MODES.LOCAL_ONLY : SESSION_MODES.ANONYMOUS,
  refreshState: "idle",

  setAuth(token, user) {
    writeVersionedStorageJson(STORAGE_KEYS.USER, STORED_USER_VERSION, user);
    useWorkspaceStore.getState().validateCacheOwner(user.id);
    set({
      accessToken: token,
      user,
      sessionMode: SESSION_MODES.AUTHENTICATED,
      refreshState: "idle",
    });
  },

  clearAuth() {
    removeStorageItem(STORAGE_KEYS.USER);
    docCache.clearAll();
    queryClient.clear();
    // Symmetric with setAuth's validateCacheOwner wiring: a full logout must
    // also clear the persisted workspace cache so the previous user's workspace
    // list, page snapshots, cached access, shared inbox, and cacheUserId do not
    // linger. Passing `null` forces `cacheUserId` onto the new state (the
    // undefined-arg path would leave the persisted identity in place because
    // Zustand's `set` merges partial state).
    // markExpired/markLocalOnly intentionally do NOT call this (they keep the
    // cache for offline/local-only surfaces).
    useWorkspaceStore.getState().resetStore(null);
    set({
      accessToken: null,
      user: null,
      sessionMode: SESSION_MODES.ANONYMOUS,
      refreshState: "idle",
    });
  },

  markExpired() {
    set((state) => ({
      accessToken: null,
      sessionMode: SESSION_MODES.EXPIRED,
      user: state.user,
      refreshState: "idle",
    }));
  },

  markLocalOnly() {
    set((state) => ({
      accessToken: null,
      sessionMode: SESSION_MODES.LOCAL_ONLY,
      user: state.user,
      refreshState: "idle",
    }));
  },

  setUser(user) {
    writeVersionedStorageJson(STORAGE_KEYS.USER, STORED_USER_VERSION, user);
    set({ user });
  },

  setSessionMode(mode) {
    set({ sessionMode: mode });
  },

  setRefreshState(refreshState) {
    set({ refreshState });
  },
}));
