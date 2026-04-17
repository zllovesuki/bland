import { describe, expect, it } from "vitest";
import {
  isWorkspaceReady,
  hasWorkspaceIdentity,
  getMentionCachePolicy,
  type WorkspaceRouteState,
} from "@/client/lib/workspace-route-model";

const WS_ID = "ws-1";

const states: Record<string, WorkspaceRouteState> = {
  loadingEmpty: { phase: "loading", workspaceId: null },
  loadingSeeded: { phase: "loading", workspaceId: WS_ID },
  readyMemberLive: { phase: "ready", workspaceId: WS_ID, accessMode: "member", cacheStatus: "live" },
  readyMemberCache: { phase: "ready", workspaceId: WS_ID, accessMode: "member", cacheStatus: "cache" },
  readySharedLive: { phase: "ready", workspaceId: WS_ID, accessMode: "shared", cacheStatus: "live" },
  readySharedCache: { phase: "ready", workspaceId: WS_ID, accessMode: "shared", cacheStatus: "cache" },
  degradedStaleSharedNoIdentity: {
    phase: "degraded",
    workspaceId: null,
    workspaceSlug: "my-ws",
    reason: "stale-shared",
  },
  degradedStaleShared: { phase: "degraded", workspaceId: WS_ID, workspaceSlug: "my-ws", reason: "stale-shared" },
  errorNotFound: { phase: "error", errorKind: "not-found", message: "Workspace not found" },
  errorNetwork: { phase: "error", errorKind: "network", message: "Failed to load workspace" },
};

describe("isWorkspaceReady", () => {
  const ready = ["readyMemberLive", "readyMemberCache", "readySharedLive", "readySharedCache"];
  const notReady = [
    "loadingEmpty",
    "loadingSeeded",
    "degradedStaleSharedNoIdentity",
    "degradedStaleShared",
    "errorNotFound",
    "errorNetwork",
  ];

  it.each(ready)("returns true for %s", (key) => {
    expect(isWorkspaceReady(states[key])).toBe(true);
  });

  it.each(notReady)("returns false for %s", (key) => {
    expect(isWorkspaceReady(states[key])).toBe(false);
  });

  it("narrows to workspaceId + accessMode + cacheStatus", () => {
    const state = states.readyMemberLive;
    if (isWorkspaceReady(state)) {
      expect(state.workspaceId).toBe(WS_ID);
      expect(state.accessMode).toBe("member");
      expect(state.cacheStatus).toBe("live");
    }
  });
});

describe("hasWorkspaceIdentity", () => {
  const withIdentity = [
    "loadingSeeded",
    "readyMemberLive",
    "readyMemberCache",
    "readySharedLive",
    "readySharedCache",
    "degradedStaleShared",
  ];
  const withoutIdentity = ["loadingEmpty", "degradedStaleSharedNoIdentity", "errorNotFound", "errorNetwork"];

  it.each(withIdentity)("returns true for %s", (key) => {
    expect(hasWorkspaceIdentity(states[key])).toBe(true);
  });

  it.each(withoutIdentity)("returns false for %s", (key) => {
    expect(hasWorkspaceIdentity(states[key])).toBe(false);
  });

  it("narrows workspaceId to non-null", () => {
    const state = states.degradedStaleShared;
    if (hasWorkspaceIdentity(state)) {
      expect(state.workspaceId).toBe(WS_ID);
    }
  });
});

describe("getMentionCachePolicy", () => {
  it("returns live only for ready states with live cacheStatus", () => {
    expect(getMentionCachePolicy(states.readyMemberLive)).toBe("live");
    expect(getMentionCachePolicy(states.readySharedLive)).toBe("live");
  });

  it("returns cache for ready states backed by cache", () => {
    expect(getMentionCachePolicy(states.readyMemberCache)).toBe("cache");
    expect(getMentionCachePolicy(states.readySharedCache)).toBe("cache");
  });

  it("returns cache for non-ready phases", () => {
    expect(getMentionCachePolicy(states.loadingEmpty)).toBe("cache");
    expect(getMentionCachePolicy(states.loadingSeeded)).toBe("cache");
    expect(getMentionCachePolicy(states.degradedStaleSharedNoIdentity)).toBe("cache");
    expect(getMentionCachePolicy(states.degradedStaleShared)).toBe("cache");
    expect(getMentionCachePolicy(states.errorNotFound)).toBe("cache");
  });
});
