import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import { createUser } from "@tests/client/util/fixtures";
import { SESSION_MODES, STORAGE_KEYS } from "@/client/lib/constants";

let useAuthStore: typeof import("@/client/stores/auth-store").useAuthStore;

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  const mod = await import("@/client/stores/auth-store");
  useAuthStore = mod.useAuthStore;
});

afterEach(() => {
  restoreLocalStorage();
});

describe("auth-store", () => {
  describe("initial state", () => {
    it("starts with RESTORING session mode and no auth", () => {
      const state = useAuthStore.getState();
      expect(state.sessionMode).toBe(SESSION_MODES.RESTORING);
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.hasLocalSession).toBe(false);
      expect(state.bootstrapped).toBe(false);
    });

    it("rehydrates cached user from localStorage", async () => {
      const user = createUser();
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      vi.resetModules();
      const mod = await import("@/client/stores/auth-store");
      expect(mod.useAuthStore.getState().user).toEqual(user);
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
      expect(state.isAuthenticated).toBe(true);
      expect(state.hasLocalSession).toBe(true);
    });

    it("persists user to localStorage", () => {
      const user = createUser();
      useAuthStore.getState().setAuth("tok-123", user);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.USER)!)).toEqual(user);
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
      expect(state.isAuthenticated).toBe(false);
      expect(state.hasLocalSession).toBe(true);
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
      expect(state.isAuthenticated).toBe(false);
      expect(state.hasLocalSession).toBe(false);
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
      [SESSION_MODES.RESTORING, false, false],
    ] as const)("mode %s -> isAuthenticated=%s, hasLocalSession=%s", (mode, expectAuth, expectLocal) => {
      useAuthStore.getState().setSessionMode(mode);

      const state = useAuthStore.getState();
      expect(state.sessionMode).toBe(mode);
      expect(state.isAuthenticated).toBe(expectAuth);
      expect(state.hasLocalSession).toBe(expectLocal);
    });
  });

  describe("setBootstrapped", () => {
    it("sets bootstrapped to true", () => {
      useAuthStore.getState().setBootstrapped();
      expect(useAuthStore.getState().bootstrapped).toBe(true);
    });
  });
});
