import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import { SESSION_MODES } from "@/client/lib/constants";

let installManifestGate: typeof import("@/client/lib/install-gate").installManifestGate;
let useAuthStore: typeof import("@/client/stores/auth-store").useAuthStore;

function createHeadStub() {
  const children = new Set<Record<string, unknown>>();
  return {
    querySelector: (selector: string) => {
      if (selector !== 'link[rel="manifest"]') return null;
      for (const el of children) {
        if (el.rel === "manifest") return el;
      }
      return null;
    },
    appendChild: (el: Record<string, unknown>) => {
      children.add(el);
      return el;
    },
    children,
  };
}

function installDocumentStub() {
  const head = createHeadStub();
  const doc = {
    head,
    createElement: (tag: string) => {
      const el: Record<string, unknown> = { tagName: tag.toUpperCase() };
      el.remove = () => {
        head.children.delete(el);
      };
      return el;
    },
  };
  Object.defineProperty(globalThis, "document", { value: doc, writable: true, configurable: true });
  return head;
}

function restoreDocumentStub() {
  Object.defineProperty(globalThis, "document", { value: undefined, writable: true, configurable: true });
}

let head: ReturnType<typeof installDocumentStub>;

beforeEach(async () => {
  installLocalStorageStub();
  head = installDocumentStub();
  vi.resetModules();
  const authMod = await import("@/client/stores/auth-store");
  useAuthStore = authMod.useAuthStore;
  const gateMod = await import("@/client/lib/install-gate");
  installManifestGate = gateMod.installManifestGate;
});

afterEach(() => {
  restoreLocalStorage();
  restoreDocumentStub();
  vi.restoreAllMocks();
});

function hasManifestLink(): boolean {
  for (const el of head.children) {
    if (el.rel === "manifest") return true;
  }
  return false;
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
    let count = 0;
    for (const el of head.children) {
      if (el.rel === "manifest") count += 1;
    }
    expect(count).toBe(1);
  });
});
