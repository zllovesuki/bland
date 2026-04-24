import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import { createUser } from "@tests/client/util/fixtures";
import { SESSION_MODES, STORAGE_KEYS } from "@/client/lib/constants";

let useAuthStore: typeof import("@/client/stores/auth-store").useAuthStore;
let selectIsAuthenticated: typeof import("@/client/stores/auth-store").selectIsAuthenticated;
let selectHasLocalSession: typeof import("@/client/stores/auth-store").selectHasLocalSession;

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  const mod = await import("@/client/stores/auth-store");
  useAuthStore = mod.useAuthStore;
  selectIsAuthenticated = mod.selectIsAuthenticated;
  selectHasLocalSession = mod.selectHasLocalSession;
});

afterEach(() => {
  restoreLocalStorage();
});

describe("auth-store", () => {
  describe("initial state", () => {
    it("starts with ANONYMOUS session mode and no auth", () => {
      const state = useAuthStore.getState();
      expect(state.sessionMode).toBe(SESSION_MODES.ANONYMOUS);
      expect(state.accessToken).toBeNull();
      expect(state.refreshState).toBe("idle");
      expect(selectIsAuthenticated(state)).toBe(false);
      expect(selectHasLocalSession(state)).toBe(false);
    });

    it("rehydrates cached user from localStorage", async () => {
      const user = createUser();
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({ version: 1, value: user }));
      vi.resetModules();
      const mod = await import("@/client/stores/auth-store");
      expect(mod.useAuthStore.getState().user).toEqual(user);
      expect(mod.useAuthStore.getState().sessionMode).toBe(SESSION_MODES.LOCAL_ONLY);
    });

    it("handles malformed user JSON gracefully", async () => {
      localStorage.setItem(STORAGE_KEYS.USER, "{bad-json");
      vi.resetModules();
      const mod = await import("@/client/stores/auth-store");
      expect(mod.useAuthStore.getState().user).toBeNull();
    });
  });

  describe("setAuth", () => {
    it("sets AUTHENTICATED mode with correct derived flags", () => {
      const user = createUser();
      useAuthStore.getState().setAuth("tok-123", user);

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe("tok-123");
      expect(state.user).toEqual(user);
      expect(state.sessionMode).toBe(SESSION_MODES.AUTHENTICATED);
      expect(selectIsAuthenticated(state)).toBe(true);
      expect(selectHasLocalSession(state)).toBe(true);
    });

    it("persists user to localStorage", () => {
      const user = createUser();
      useAuthStore.getState().setAuth("tok-123", user);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.USER)!)).toEqual({ version: 1, value: user });
    });

    it("does not throw when localStorage writes fail", () => {
      const user = createUser();
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => useAuthStore.getState().setAuth("tok-123", user)).not.toThrow();
    });
  });

  describe("markExpired", () => {
    it("clears token but retains user", () => {
      const user = createUser();
      useAuthStore.getState().setAuth("tok-123", user);
      useAuthStore.getState().markExpired();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.user).toEqual(user);
      expect(state.sessionMode).toBe(SESSION_MODES.EXPIRED);
      expect(selectIsAuthenticated(state)).toBe(false);
      expect(selectHasLocalSession(state)).toBe(true);
    });
  });

  describe("markLocalOnly", () => {
    it("clears token but keeps the cached user for local-only flows", () => {
      const user = createUser();
      useAuthStore.getState().setAuth("tok-123", user);
      useAuthStore.getState().markLocalOnly();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.user).toEqual(user);
      expect(state.sessionMode).toBe(SESSION_MODES.LOCAL_ONLY);
      expect(selectIsAuthenticated(state)).toBe(false);
      expect(selectHasLocalSession(state)).toBe(true);
    });
  });

  describe("clearAuth", () => {
    it("resets to ANONYMOUS and removes all persisted data", () => {
      const user = createUser();
      useAuthStore.getState().setAuth("tok-123", user);
      useAuthStore.getState().clearAuth();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.user).toBeNull();
      expect(state.sessionMode).toBe(SESSION_MODES.ANONYMOUS);
      expect(selectIsAuthenticated(state)).toBe(false);
      expect(selectHasLocalSession(state)).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_DOCS)).toBeNull();
    });
  });

  describe("setSessionMode", () => {
    it.each([
      [SESSION_MODES.AUTHENTICATED, true, true],
      [SESSION_MODES.LOCAL_ONLY, false, true],
      [SESSION_MODES.EXPIRED, false, true],
      [SESSION_MODES.ANONYMOUS, false, false],
    ] as const)("mode %s -> isAuthenticated=%s, hasLocalSession=%s", (mode, expectAuth, expectLocal) => {
      useAuthStore.getState().setSessionMode(mode);

      const state = useAuthStore.getState();
      expect(state.sessionMode).toBe(mode);
      expect(selectIsAuthenticated(state)).toBe(expectAuth);
      expect(selectHasLocalSession(state)).toBe(expectLocal);
    });
  });

  describe("setRefreshState", () => {
    it("tracks the non-persisted refresh lifecycle", () => {
      useAuthStore.getState().setRefreshState("refreshing");
      expect(useAuthStore.getState().refreshState).toBe("refreshing");
      useAuthStore.getState().setRefreshState("idle");
      expect(useAuthStore.getState().refreshState).toBe("idle");
    });
  });
});
