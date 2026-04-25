import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let clearPwaRuntimeCaches: typeof import("@/client/lib/pwa").clearPwaRuntimeCaches;
let registerServiceWorker: typeof import("@/client/lib/pwa").registerServiceWorker;
let usePwaUpdate: typeof import("@/client/lib/pwa").usePwaUpdate;

const serwistMock = vi.hoisted(() => {
  class MockSerwist {
    scriptURL: string;
    options: RegistrationOptions;
    listeners = new Map<string, Array<() => void>>();
    register = vi.fn(async () => undefined);
    update = vi.fn(async () => undefined);
    messageSkipWaiting = vi.fn();

    constructor(scriptURL: string, options: RegistrationOptions) {
      this.scriptURL = scriptURL;
      this.options = options;
      serwistMock.instances.push(this);
    }

    addEventListener(type: string, listener: () => void) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    emit(type: string) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener();
      }
    }
  }

  const serwistMock = {
    instances: [] as MockSerwist[],
    Serwist: MockSerwist,
  };

  return serwistMock;
});

const reloadPwaMock = vi.hoisted(() => vi.fn());

vi.mock("@serwist/window", () => ({ Serwist: serwistMock.Serwist }));
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: () => () => void, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock("@/client/lib/pwa-reload", () => ({ reloadPwa: reloadPwaMock }));

let originalCachesDescriptor: PropertyDescriptor | undefined;
let originalServiceWorkerDescriptor: PropertyDescriptor | undefined;
let originalVisibilityDescriptor: PropertyDescriptor | undefined;

let cachesDeleted: string[];

function installCachesStub(options: { throwOnDelete?: boolean } = {}) {
  cachesDeleted = [];
  const stub = {
    delete: async (name: string) => {
      if (options.throwOnDelete) throw new Error("quota exceeded");
      cachesDeleted.push(name);
      return true;
    },
  };
  Object.defineProperty(globalThis, "caches", { value: stub, writable: true, configurable: true });
}

function uninstallCaches() {
  Object.defineProperty(globalThis, "caches", { value: undefined, writable: true, configurable: true });
}

function installServiceWorker(): void {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register: vi.fn(async () => ({})) },
    writable: true,
    configurable: true,
  });
}

function uninstallServiceWorker(): void {
  // Force the `"serviceWorker" in navigator` check to be false by deleting
  // the slot on the navigator instance.
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
}

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    writable: true,
    configurable: true,
  });
}

beforeEach(async () => {
  originalCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
  originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");

  reloadPwaMock.mockReset();
  vi.resetModules();
  vi.unstubAllEnvs();
  serwistMock.instances.length = 0;
  const mod = await import("@/client/lib/pwa");
  clearPwaRuntimeCaches = mod.clearPwaRuntimeCaches;
  registerServiceWorker = mod.registerServiceWorker;
  usePwaUpdate = mod.usePwaUpdate;
});

afterEach(() => {
  if (originalCachesDescriptor) {
    Object.defineProperty(globalThis, "caches", originalCachesDescriptor);
  } else {
    delete (globalThis as { caches?: unknown }).caches;
  }
  if (originalServiceWorkerDescriptor) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
  } else {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }
  if (originalVisibilityDescriptor) {
    Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
  } else {
    delete (document as { visibilityState?: unknown }).visibilityState;
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("clearPwaRuntimeCaches", () => {
  it("deletes only the bland-uploads-v1 runtime cache", async () => {
    installCachesStub();
    await clearPwaRuntimeCaches();
    expect(cachesDeleted).toEqual(["bland-uploads-v1"]);
  });

  it("is a no-op when Cache Storage is unavailable", async () => {
    uninstallCaches();
    await expect(clearPwaRuntimeCaches()).resolves.toBeUndefined();
  });

  it("does not throw when cache.delete rejects", async () => {
    installCachesStub({ throwOnDelete: true });
    await expect(clearPwaRuntimeCaches()).resolves.toBeUndefined();
  });
});

describe("registerServiceWorker", () => {
  it("is a no-op when navigator.serviceWorker is unavailable", () => {
    uninstallServiceWorker();
    expect(() => registerServiceWorker()).not.toThrow();
    expect(serwistMock.instances).toHaveLength(0);
  });

  it("is a no-op outside production", () => {
    vi.stubEnv("PROD", false);
    installServiceWorker();
    registerServiceWorker();
    expect(serwistMock.instances).toHaveLength(0);
  });

  it("registers the production service worker through Serwist", () => {
    vi.stubEnv("PROD", true);
    installServiceWorker();
    registerServiceWorker();

    expect(serwistMock.instances).toHaveLength(1);
    expect(serwistMock.instances[0].scriptURL).toBe("/sw.js");
    expect(serwistMock.instances[0].options).toEqual({ scope: "/", type: "classic" });
    expect(serwistMock.instances[0].register).toHaveBeenCalledTimes(1);
  });

  it("exposes a waiting update prompt and applies it on request", () => {
    vi.stubEnv("PROD", true);
    installServiceWorker();

    registerServiceWorker();
    const instance = serwistMock.instances[0];

    expect(usePwaUpdate()).toEqual({ waiting: false, apply: null });

    instance.emit("waiting");
    const update = usePwaUpdate();
    expect(update.waiting).toBe(true);
    expect(update.apply).toEqual(expect.any(Function));

    update.apply?.();
    expect(instance.messageSkipWaiting).toHaveBeenCalledTimes(1);
    expect(reloadPwaMock).not.toHaveBeenCalled();

    instance.emit("controlling");
    expect(reloadPwaMock).toHaveBeenCalledTimes(1);
  });

  it("rechecks for updates when the tab becomes visible", () => {
    vi.stubEnv("PROD", true);
    installServiceWorker();

    registerServiceWorker();
    const instance = serwistMock.instances[0];

    setVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(instance.update).toHaveBeenCalledTimes(1);
  });

  it("does not recheck for updates while the tab is hidden", () => {
    vi.stubEnv("PROD", true);
    installServiceWorker();

    registerServiceWorker();
    const instance = serwistMock.instances[0];

    setVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(instance.update).not.toHaveBeenCalled();
  });
});
