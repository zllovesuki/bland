import { create } from "zustand";
import type { User } from "@/shared/types";
import { STORAGE_KEYS } from "@/client/lib/constants";

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  bootstrapped: boolean;
  setAuth(token: string, user: User): void;
  clearAuth(): void;
  setUser(user: User): void;
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

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: storedUser,
  isAuthenticated: false,
  bootstrapped: false,

  setAuth(token, user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ accessToken: token, user, isAuthenticated: true });
  },

  clearAuth() {
    localStorage.removeItem(STORAGE_KEYS.USER);
    set({ accessToken: null, user: null, isAuthenticated: false });
  },

  setUser(user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ user });
  },

  setBootstrapped() {
    set({ bootstrapped: true });
  },
}));
