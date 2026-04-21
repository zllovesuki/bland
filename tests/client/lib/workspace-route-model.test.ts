import { describe, expect, it } from "vitest";
import {
  isWorkspaceReady,
  hasWorkspaceIdentity,
  isResolvingWorkspace,
  type WorkspaceRouteState,
} from "@/client/lib/workspace-route-model";

const WS_ID = "ws-1";

const states: Record<string, WorkspaceRouteState> = {
  loadingEmpty: { phase: "loading", workspaceId: null },
  loadingSeeded: { phase: "loading", workspaceId: WS_ID },
  readyMember: { phase: "ready", workspaceId: WS_ID, accessMode: "member" },
  readyShared: { phase: "ready", workspaceId: WS_ID, accessMode: "shared" },
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
  const ready = ["readyMember", "readyShared"];
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

  it("narrows to workspaceId + accessMode", () => {
    const state = states.readyMember;
    if (isWorkspaceReady(state)) {
      expect(state.workspaceId).toBe(WS_ID);
      expect(state.accessMode).toBe("member");
    }
  });
});

describe("hasWorkspaceIdentity", () => {
  const withIdentity = ["loadingSeeded", "readyMember", "readyShared", "degradedStaleShared"];
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

describe("isResolvingWorkspace", () => {
  const resolving = ["loadingEmpty", "loadingSeeded", "degradedStaleSharedNoIdentity", "degradedStaleShared"];
  const notResolving = ["readyMember", "readyShared", "errorNotFound", "errorNetwork"];

  it.each(resolving)("returns true for %s", (key) => {
    expect(isResolvingWorkspace(states[key])).toBe(true);
  });

  it.each(notResolving)("returns false for %s", (key) => {
    expect(isResolvingWorkspace(states[key])).toBe(false);
  });
});
