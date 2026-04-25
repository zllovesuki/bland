import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_MODES } from "@/client/lib/constants";

let installManifestGate: typeof import("@/client/lib/install-gate").installManifestGate;
let useAuthStore: typeof import("@/client/stores/auth-store").useAuthStore;

beforeEach(async () => {
  localStorage.clear();
  document.head.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());
  vi.resetModules();
  const authMod = await import("@/client/stores/auth-store");
  useAuthStore = authMod.useAuthStore;
  const gateMod = await import("@/client/lib/install-gate");
  installManifestGate = gateMod.installManifestGate;
});

afterEach(() => {
  document.head.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());
  localStorage.clear();
  vi.restoreAllMocks();
});

function hasManifestLink(): boolean {
  return document.head.querySelector('link[rel="manifest"]') !== null;
}

describe("installManifestGate", () => {
  it("does not mount the manifest link for an anonymous session", () => {
    useAuthStore.setState({ sessionMode: SESSION_MODES.ANONYMOUS, user: null });
    installManifestGate();
    expect(hasManifestLink()).toBe(false);
  });

  it("mounts the manifest link when the user has a local session at startup", () => {
    useAuthStore.setState({
      sessionMode: SESSION_MODES.AUTHENTICATED,
      user: { id: "u1", email: "a@b", name: "A", avatar_url: null, created_at: "2024-01-01T00:00:00Z" },
      accessToken: "tok",
    });
    installManifestGate();
    expect(hasManifestLink()).toBe(true);
  });

  it("mounts the link on login and removes it on logout", () => {
    useAuthStore.setState({ sessionMode: SESSION_MODES.ANONYMOUS, user: null });
    installManifestGate();
    expect(hasManifestLink()).toBe(false);

    useAuthStore.setState({
      sessionMode: SESSION_MODES.AUTHENTICATED,
      user: { id: "u1", email: "a@b", name: "A", avatar_url: null, created_at: "2024-01-01T00:00:00Z" },
      accessToken: "tok",
    });
    expect(hasManifestLink()).toBe(true);

    useAuthStore.getState().clearAuth();
    expect(hasManifestLink()).toBe(false);
  });

  it("keeps the link mounted through LOCAL_ONLY and EXPIRED transitions", () => {
    useAuthStore.setState({
      sessionMode: SESSION_MODES.AUTHENTICATED,
      user: { id: "u1", email: "a@b", name: "A", avatar_url: null, created_at: "2024-01-01T00:00:00Z" },
      accessToken: "tok",
    });
    installManifestGate();
    expect(hasManifestLink()).toBe(true);

    useAuthStore.getState().markLocalOnly();
    expect(hasManifestLink()).toBe(true);

    useAuthStore.getState().markExpired();
    expect(hasManifestLink()).toBe(true);
  });

  it("is idempotent when called twice", () => {
    useAuthStore.setState({
      sessionMode: SESSION_MODES.AUTHENTICATED,
      user: { id: "u1", email: "a@b", name: "A", avatar_url: null, created_at: "2024-01-01T00:00:00Z" },
      accessToken: "tok",
    });
    installManifestGate();
    installManifestGate();
    expect(document.head.querySelectorAll('link[rel="manifest"]').length).toBe(1);
  });
});
