import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let clearPwaRuntimeCaches: typeof import("@/client/lib/pwa").clearPwaRuntimeCaches;
let registerServiceWorker: typeof import("@/client/lib/pwa").registerServiceWorker;
let usePwaUpdate: typeof import("@/client/lib/pwa").usePwaUpdate;

let deleted: string[];
let originalCaches: typeof globalThis.caches | undefined;
let originalNavigator: typeof globalThis.navigator | undefined;
let originalWindow: typeof globalThis.window | undefined;

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

vi.mock("@serwist/window", () => ({ Serwist: serwistMock.Serwist }));
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: () => () => void, getSnapshot: () => unknown) => getSnapshot(),
}));

function installCachesStub(options: { throwOnDelete?: boolean } = {}) {
  deleted = [];
  const stub = {
    delete: async (name: string) => {
      if (options.throwOnDelete) throw new Error("quota exceeded");
      deleted.push(name);
      return true;
    },
  };
  originalCaches = (globalThis as { caches?: typeof globalThis.caches }).caches;
  Object.defineProperty(globalThis, "caches", { value: stub, writable: true, configurable: true });
}

function restoreCachesStub() {
  Object.defineProperty(globalThis, "caches", { value: originalCaches, writable: true, configurable: true });
}

function installNavigatorStub(hasServiceWorker: boolean) {
  originalNavigator = globalThis.navigator;
  const nav = hasServiceWorker ? { serviceWorker: { register: vi.fn(async () => ({})) } } : {};
  Object.defineProperty(globalThis, "navigator", { value: nav, writable: true, configurable: true });
}

function restoreNavigatorStub() {
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, writable: true, configurable: true });
}

function installWindowReloadStub() {
  const reload = vi.fn();
  originalWindow = (globalThis as { window?: typeof globalThis.window }).window;
  Object.defineProperty(globalThis, "window", {
    value: { location: { reload } },
    writable: true,
    configurable: true,
  });
  return reload;
}

function restoreWindowStub() {
  Object.defineProperty(globalThis, "window", { value: originalWindow, writable: true, configurable: true });
}

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  serwistMock.instances.length = 0;
  const mod = await import("@/client/lib/pwa");
  clearPwaRuntimeCaches = mod.clearPwaRuntimeCaches;
  registerServiceWorker = mod.registerServiceWorker;
  usePwaUpdate = mod.usePwaUpdate;
});

afterEach(() => {
  restoreCachesStub();
  restoreNavigatorStub();
  restoreWindowStub();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("clearPwaRuntimeCaches", () => {
  it("deletes only the bland-uploads-v1 runtime cache", async () => {
    installCachesStub();
    await clearPwaRuntimeCaches();
    expect(deleted).toEqual(["bland-uploads-v1"]);
  });

  it("is a no-op when Cache Storage is unavailable", async () => {
    Object.defineProperty(globalThis, "caches", { value: undefined, writable: true, configurable: true });
    await expect(clearPwaRuntimeCaches()).resolves.toBeUndefined();
  });

  it("does not throw when cache.delete rejects", async () => {
    installCachesStub({ throwOnDelete: true });
    await expect(clearPwaRuntimeCaches()).resolves.toBeUndefined();
  });
});

describe("registerServiceWorker", () => {
  it("is a no-op when navigator.serviceWorker is unavailable", () => {
    installNavigatorStub(false);
    expect(() => registerServiceWorker()).not.toThrow();
    expect(serwistMock.instances).toHaveLength(0);
  });

  it("is a no-op outside production", () => {
    vi.stubEnv("PROD", false);
    installNavigatorStub(true);
    registerServiceWorker();
    expect(serwistMock.instances).toHaveLength(0);
  });

  it("registers the production service worker through Serwist", () => {
    vi.stubEnv("PROD", true);
    installNavigatorStub(true);
    registerServiceWorker();

    expect(serwistMock.instances).toHaveLength(1);
    expect(serwistMock.instances[0].scriptURL).toBe("/sw.js");
    expect(serwistMock.instances[0].options).toEqual({ scope: "/", type: "classic" });
    expect(serwistMock.instances[0].register).toHaveBeenCalledTimes(1);
  });

  it("exposes a waiting update prompt and applies it on request", () => {
    vi.stubEnv("PROD", true);
    installNavigatorStub(true);
    const reload = installWindowReloadStub();

    registerServiceWorker();
    const instance = serwistMock.instances[0];

    expect(usePwaUpdate()).toEqual({ waiting: false, apply: null });

    instance.emit("waiting");
    const update = usePwaUpdate();
    expect(update.waiting).toBe(true);
    expect(update.apply).toEqual(expect.any(Function));

    update.apply?.();
    expect(instance.messageSkipWaiting).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    instance.emit("controlling");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
