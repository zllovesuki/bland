import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvePageMentionsResponse, ResolvedViewerContext } from "@/shared/types";
import type { WorkspaceRouteSource } from "@/client/stores/workspace-store";

let createPageMentionResolver: typeof import("@/client/components/editor/lib/page-mention-resolver").createPageMentionResolver;

const resolveMock = vi.fn();

function createViewer(overrides: Partial<ResolvedViewerContext> = {}): ResolvedViewerContext {
  return {
    access_mode: "member",
    principal_type: "user",
    route_kind: "canonical",
    workspace_slug: "demo",
    ...overrides,
  };
}

function createResponse(
  pageIds: string[],
  opts: {
    viewer?: ResolvedViewerContext;
    accessibleIds?: string[];
  } = {},
): ResolvePageMentionsResponse {
  const accessibleIds = new Set(opts.accessibleIds ?? pageIds);
  return {
    viewer: opts.viewer ?? createViewer(),
    mentions: pageIds.map((pageId) =>
      accessibleIds.has(pageId)
        ? {
            page_id: pageId,
            accessible: true,
            title: `Title ${pageId}`,
            icon: null,
          }
        : {
            page_id: pageId,
            accessible: false,
            title: null,
            icon: null,
          },
    ),
  };
}

function createCachedLookup(entries: Record<string, { title: string; icon: string | null }>) {
  return (pageId: string) => entries[pageId] ?? null;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createResolver(
  opts: Partial<{
    workspaceId: string;
    shareToken: string | undefined;
    viewer: ResolvedViewerContext;
    routeSource: WorkspaceRouteSource;
    lookupCachedPage: (pageId: string) => { title: string; icon: string | null } | null;
  }> = {},
) {
  let routeSource = opts.routeSource ?? "live";
  const resolver = createPageMentionResolver({
    workspaceId: opts.workspaceId ?? "ws-1",
    shareToken: opts.shareToken,
    viewer: opts.viewer ?? createViewer(),
    getRouteSource: () => routeSource,
    lookupCachedPage: opts.lookupCachedPage,
  });

  return {
    resolver,
    setRouteSource(next: WorkspaceRouteSource) {
      routeSource = next;
    },
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  resolveMock.mockReset();
  vi.doMock("@/client/lib/api", () => ({
    api: {
      pageMentions: {
        resolve: resolveMock,
      },
    },
  }));
  const mod = await import("@/client/components/editor/lib/page-mention-resolver");
  createPageMentionResolver = mod.createPageMentionResolver;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("page mention resolver", () => {
  it("chunks more than 100 unique ids into multiple resolver calls", async () => {
    resolveMock.mockImplementation(async (_workspaceId: string, pageIds: string[]) => createResponse(pageIds));
    const { resolver } = createResolver();

    for (let i = 0; i < 101; i++) {
      resolver.request(`p-${i}`);
    }

    await flushAsyncWork();

    expect(resolveMock).toHaveBeenCalledTimes(2);
    expect(resolveMock.mock.calls[0]?.[1]).toHaveLength(100);
    expect(resolveMock.mock.calls[1]?.[1]).toHaveLength(1);
    expect(resolver.get("p-0")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: true,
      title: "Title p-0",
    });
    expect(resolver.get("p-100")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: true,
      title: "Title p-100",
    });
    expect(resolver.routeContext()).toEqual({ routeKind: "canonical", workspaceSlug: "demo" });
  });

  it("dedupes duplicate ids before resolving", async () => {
    resolveMock.mockImplementation(async (_workspaceId: string, pageIds: string[]) => createResponse(pageIds));
    const { resolver } = createResolver();

    resolver.request("p-1");
    resolver.request("p-1");
    resolver.request("p-1");

    await flushAsyncWork();

    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(resolveMock.mock.calls[0]?.[1]).toEqual(["p-1"]);
    expect(resolver.get("p-1")).toMatchObject({ status: "resolved", source: "server", accessible: true });
  });

  it("ignores cached labels on live canonical routes", async () => {
    const deferred = createDeferred<ResolvePageMentionsResponse>();
    resolveMock.mockReturnValueOnce(deferred.promise);
    const { resolver } = createResolver({
      routeSource: "live",
      lookupCachedPage: createCachedLookup({
        "p-1": { title: "Cached title", icon: "C" },
      }),
    });

    resolver.request("p-1");

    expect(resolver.get("p-1")).toMatchObject({
      status: "pending",
      source: null,
      accessible: false,
      title: null,
    });

    deferred.resolve(createResponse(["p-1"]));
    await flushAsyncWork();

    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: true,
      title: "Title p-1",
    });
  });

  it("uses cached labels on cache-backed canonical routes while the request is in flight", async () => {
    const deferred = createDeferred<ResolvePageMentionsResponse>();
    resolveMock.mockReturnValueOnce(deferred.promise);
    const { resolver } = createResolver({
      routeSource: "cache",
      lookupCachedPage: createCachedLookup({
        "p-1": { title: "Cached title", icon: "C" },
      }),
    });

    resolver.request("p-1");

    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "cache",
      accessible: true,
      title: "Cached title",
      icon: "C",
    });
    expect(resolver.routeContext()).toEqual({ routeKind: "canonical", workspaceSlug: "demo" });

    deferred.resolve(createResponse(["p-1"]));
    await flushAsyncWork();

    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: true,
      title: "Title p-1",
    });
  });

  it("never uses cached labels on shared routes", async () => {
    const deferred = createDeferred<ResolvePageMentionsResponse>();
    resolveMock.mockReturnValueOnce(deferred.promise);
    const { resolver } = createResolver({
      shareToken: "share-token",
      viewer: createViewer({
        access_mode: "shared",
        principal_type: "link",
        route_kind: "shared",
        workspace_slug: null,
      }),
      routeSource: "cache",
      lookupCachedPage: createCachedLookup({
        "p-1": { title: "Cached title", icon: "C" },
      }),
    });

    resolver.request("p-1");

    expect(resolver.get("p-1")).toMatchObject({
      status: "pending",
      source: null,
      accessible: false,
      title: null,
    });

    deferred.resolve(
      createResponse(["p-1"], {
        viewer: createViewer({
          access_mode: "shared",
          principal_type: "link",
          route_kind: "shared",
          workspace_slug: null,
        }),
      }),
    );
    await flushAsyncWork();

    expect(resolver.routeContext()).toEqual({ routeKind: "shared", workspaceSlug: null });
    expect(resolver.get("p-1")).toMatchObject({ status: "resolved", source: "server", accessible: true });
  });

  it("keeps cached labels visible when transport requests fail in cache mode", async () => {
    resolveMock.mockRejectedValueOnce(new Error("offline"));
    const { resolver } = createResolver({
      routeSource: "cache",
      lookupCachedPage: createCachedLookup({
        "p-1": { title: "Cached title", icon: "C" },
      }),
    });

    resolver.request("p-1");
    await flushAsyncWork();

    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "cache",
      accessible: true,
      title: "Cached title",
      icon: "C",
    });
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });

  it("keeps uncached ids pending until the resolver returns metadata", async () => {
    const deferred = createDeferred<ResolvePageMentionsResponse>();
    resolveMock.mockReturnValueOnce(deferred.promise);
    const { resolver } = createResolver({
      routeSource: "cache",
      lookupCachedPage: createCachedLookup({}),
    });

    resolver.request("p-2");

    expect(resolver.get("p-2")).toMatchObject({
      status: "pending",
      source: null,
      accessible: false,
      title: null,
      icon: null,
    });

    deferred.resolve(createResponse(["p-2"]));
    await flushAsyncWork();

    expect(resolver.get("p-2")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: true,
      title: "Title p-2",
    });
  });

  it("preserves resolved slices and retries only failed slices", async () => {
    resolveMock
      .mockImplementationOnce(async (_workspaceId: string, pageIds: string[]) => createResponse(pageIds))
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(async (_workspaceId: string, pageIds: string[]) => createResponse(pageIds));

    const { resolver } = createResolver();
    for (let i = 0; i < 101; i++) {
      resolver.request(`p-${i}`);
    }

    await flushAsyncWork();

    expect(resolveMock).toHaveBeenCalledTimes(2);
    expect(resolver.get("p-0")).toMatchObject({ status: "resolved", source: "server", accessible: true });
    expect(resolver.get("p-100")).toMatchObject({ status: "pending", source: null, accessible: false, title: null });

    await vi.advanceTimersByTimeAsync(1000);
    await flushAsyncWork();

    expect(resolveMock).toHaveBeenCalledTimes(3);
    expect(resolveMock.mock.calls[2]?.[1]).toEqual(["p-100"]);
    expect(resolver.get("p-100")).toMatchObject({ status: "resolved", source: "server", accessible: true });
  });

  it("accepts authoritative viewer changes from the server", async () => {
    resolveMock.mockImplementationOnce(async (_workspaceId: string, pageIds: string[]) =>
      createResponse(pageIds, {
        viewer: createViewer({
          access_mode: "member",
          principal_type: "user",
          route_kind: "canonical",
          workspace_slug: "demo",
        }),
      }),
    );

    const { resolver } = createResolver({
      shareToken: "share-token",
      viewer: createViewer({
        access_mode: "shared",
        principal_type: "link",
        route_kind: "shared",
        workspace_slug: null,
      }),
    });

    resolver.request("p-1");
    await flushAsyncWork();

    expect(resolver.routeContext()).toEqual({ routeKind: "canonical", workspaceSlug: "demo" });
    expect(resolver.get("p-1")).toMatchObject({ status: "resolved", source: "server", accessible: true });
  });

  it("overrides cached labels when the server resolves a mention as restricted", async () => {
    resolveMock.mockImplementationOnce(async (_workspaceId: string, pageIds: string[]) =>
      createResponse(pageIds, { accessibleIds: [] }),
    );

    const { resolver } = createResolver({
      routeSource: "cache",
      lookupCachedPage: createCachedLookup({
        "p-1": { title: "Cached title", icon: "C" },
      }),
    });

    resolver.request("p-1");
    await flushAsyncWork();

    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: false,
      title: null,
      icon: null,
    });
  });

  it("does not retry route-level failures and resolves mentions as restricted", async () => {
    resolveMock.mockRejectedValueOnce({ error: "validation_error", message: "Invalid request body" });
    const { resolver } = createResolver();

    resolver.request("p-1");
    await flushAsyncWork();

    await vi.advanceTimersByTimeAsync(10_000);
    await flushAsyncWork();

    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: false,
      title: null,
      icon: null,
    });
  });

  it("revalidates cache-backed entries when route policy flips back to live", async () => {
    resolveMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(async (_workspaceId: string, pageIds: string[]) => createResponse(pageIds));

    const { resolver, setRouteSource } = createResolver({
      routeSource: "cache",
      lookupCachedPage: createCachedLookup({
        "p-1": { title: "Cached title", icon: "C" },
      }),
    });

    resolver.request("p-1");
    await flushAsyncWork();

    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "cache",
      title: "Cached title",
    });

    setRouteSource("live");
    resolver.syncPolicy();
    await flushAsyncWork();

    expect(resolveMock).toHaveBeenCalledTimes(2);
    expect(resolver.get("p-1")).toMatchObject({
      status: "resolved",
      source: "server",
      accessible: true,
      title: "Title p-1",
    });
  });

  it("dispose cancels in-flight work without notifying listeners", async () => {
    const deferred = createDeferred<ResolvePageMentionsResponse>();
    resolveMock.mockReturnValueOnce(deferred.promise);
    const { resolver } = createResolver();
    const listener = vi.fn();

    resolver.request("p-1");
    const unsubscribe = resolver.subscribe("p-1", listener);
    await flushAsyncWork();
    expect(resolveMock).toHaveBeenCalledTimes(1);

    resolver.dispose();
    deferred.resolve(createResponse(["p-1"]));
    await flushAsyncWork();

    expect(listener).not.toHaveBeenCalled();
    expect(resolver.get("p-1")).toMatchObject({ status: "pending", source: null, accessible: false, title: null });

    unsubscribe();
  });
});
