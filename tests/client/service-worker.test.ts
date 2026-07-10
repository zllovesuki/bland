import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type RouteMatchOptions = {
  url: URL;
  request: {
    method: string;
    mode: string;
  };
  sameOrigin: boolean;
};

const serwistMock = vi.hoisted(() => {
  class MockStrategy {
    constructor(readonly options?: Record<string, unknown>) {}
  }

  class MockNetworkOnly extends MockStrategy {}
  class MockNetworkFirst extends MockStrategy {}
  class MockPrecacheFallbackPlugin extends MockStrategy {}
  class MockExpirationPlugin extends MockStrategy {}
  class MockCacheableResponsePlugin extends MockStrategy {}

  class MockSerwist {
    readonly captures: Array<{
      match: (options: RouteMatchOptions) => boolean;
      handler: MockStrategy;
    }> = [];

    constructor(readonly options: Record<string, unknown>) {
      serwistMock.instances.push(this);
    }

    registerCapture(match: (options: RouteMatchOptions) => boolean, handler: MockStrategy): void {
      this.captures.push({ match, handler });
    }

    addEventListeners(): void {}
  }

  const serwistMock = {
    instances: [] as MockSerwist[],
    Serwist: MockSerwist,
    NetworkOnly: MockNetworkOnly,
    NetworkFirst: MockNetworkFirst,
    PrecacheFallbackPlugin: MockPrecacheFallbackPlugin,
    ExpirationPlugin: MockExpirationPlugin,
    CacheableResponsePlugin: MockCacheableResponsePlugin,
  };

  return serwistMock;
});

vi.mock("serwist", () => ({
  CacheableResponsePlugin: serwistMock.CacheableResponsePlugin,
  ExpirationPlugin: serwistMock.ExpirationPlugin,
  NetworkFirst: serwistMock.NetworkFirst,
  NetworkOnly: serwistMock.NetworkOnly,
  PrecacheFallbackPlugin: serwistMock.PrecacheFallbackPlugin,
  Serwist: serwistMock.Serwist,
}));

const APP_ORIGIN = "https://bland.tools";

function handlerFor(
  pathname: string,
  options: { method?: string; mode?: string; origin?: string } = {},
): InstanceType<typeof serwistMock.NetworkOnly> | InstanceType<typeof serwistMock.NetworkFirst> | undefined {
  const origin = options.origin ?? APP_ORIGIN;
  const url = new URL(pathname, origin);
  const routeOptions: RouteMatchOptions = {
    url,
    request: {
      method: options.method ?? "GET",
      mode: options.mode ?? "navigate",
    },
    sameOrigin: url.origin === APP_ORIGIN,
  };

  return serwistMock.instances[0].captures.find(({ match }) => match(routeOptions))?.handler;
}

beforeAll(async () => {
  vi.stubGlobal("self", { __SW_MANIFEST: [] });
  await import("@/client/service-worker");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("service worker navigation routing", () => {
  it("keeps navigation preload enabled", () => {
    expect(serwistMock.instances).toHaveLength(1);
    expect(serwistMock.instances[0].options).toMatchObject({ navigationPreload: true });
  });

  it("routes API and party navigations through bare NetworkOnly", () => {
    for (const pathname of ["/api/v1/oidc/start", "/api/v1/oidc/callback", "/parties/doc-sync"]) {
      const handler = handlerFor(pathname);
      expect(handler).toBeInstanceOf(serwistMock.NetworkOnly);
      expect(handler?.options).toBeUndefined();
    }
  });

  it("keeps cacheable upload GETs on NetworkFirst", () => {
    expect(handlerFor("/uploads/01ABC")).toBeInstanceOf(serwistMock.NetworkFirst);
    expect(handlerFor("/uploads/01ABC", { mode: "no-cors" })).toBeInstanceOf(serwistMock.NetworkFirst);
  });

  it("routes non-cacheable upload navigations through bare NetworkOnly", () => {
    const handler = handlerFor("/uploads/01ABC/data");
    expect(handler).toBeInstanceOf(serwistMock.NetworkOnly);
    expect(handler?.options).toBeUndefined();
  });

  it("retains the precache fallback only for app navigations", () => {
    const handler = handlerFor("/workspace/page");
    expect(handler).toBeInstanceOf(serwistMock.NetworkOnly);
    expect(handler?.options?.plugins).toEqual([expect.any(serwistMock.PrecacheFallbackPlugin)]);
  });

  it("does not capture non-navigation API requests or cross-origin navigations", () => {
    expect(handlerFor("/api/v1/oidc/callback", { mode: "cors" })).toBeUndefined();
    expect(handlerFor("/api/v1/oidc/callback", { origin: "https://example.com" })).toBeUndefined();
  });
});
