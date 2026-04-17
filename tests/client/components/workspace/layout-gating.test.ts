import { describe, expect, it } from "vitest";
import type { WorkspaceRouteState } from "@/client/lib/workspace-route-model";
import { shouldBlockMemberOnlyRouteContent, shouldRedirectMemberOnlyRoute } from "@/client/lib/workspace-layout-model";

const WS_ID = "ws-1";

const states: Record<string, WorkspaceRouteState> = {
  loadingEmpty: { phase: "loading", workspaceId: null },
  loadingSeeded: { phase: "loading", workspaceId: WS_ID },
  readyMember: { phase: "ready", workspaceId: WS_ID, accessMode: "member", cacheStatus: "live" },
  readyShared: { phase: "ready", workspaceId: WS_ID, accessMode: "shared", cacheStatus: "live" },
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

describe("member-only gating - redirect decisions", () => {
  describe("isMemberOnlyRoute: true (workspace index, settings)", () => {
    it("redirects when route is error", () => {
      expect(shouldRedirectMemberOnlyRoute(states.errorNotFound, true)).toBe(true);
      expect(shouldRedirectMemberOnlyRoute(states.errorNetwork, true)).toBe(true);
    });

    it("redirects when route is shared access", () => {
      expect(shouldRedirectMemberOnlyRoute(states.readyShared, true)).toBe(true);
    });

    it("redirects when route is degraded", () => {
      expect(shouldRedirectMemberOnlyRoute(states.degradedStaleSharedNoIdentity, true)).toBe(true);
      expect(shouldRedirectMemberOnlyRoute(states.degradedStaleShared, true)).toBe(true);
    });

    it("does not redirect when route is ready-member", () => {
      expect(shouldRedirectMemberOnlyRoute(states.readyMember, true)).toBe(false);
    });

    it("does not redirect during loading phases", () => {
      expect(shouldRedirectMemberOnlyRoute(states.loadingEmpty, true)).toBe(false);
      expect(shouldRedirectMemberOnlyRoute(states.loadingSeeded, true)).toBe(false);
    });
  });

  describe("isMemberOnlyRoute: false (page route)", () => {
    it("never redirects regardless of route state", () => {
      for (const route of Object.values(states)) {
        expect(shouldRedirectMemberOnlyRoute(route, false)).toBe(false);
      }
    });
  });
});

describe("member-only gating - render blocking", () => {
  describe("isMemberOnlyRoute: true", () => {
    it("blocks render during loading phases", () => {
      expect(shouldBlockMemberOnlyRouteContent(states.loadingEmpty, true)).toBe(true);
      expect(shouldBlockMemberOnlyRouteContent(states.loadingSeeded, true)).toBe(true);
    });

    it("blocks render on error", () => {
      expect(shouldBlockMemberOnlyRouteContent(states.errorNotFound, true)).toBe(true);
    });

    it("blocks render for shared access", () => {
      expect(shouldBlockMemberOnlyRouteContent(states.readyShared, true)).toBe(true);
    });

    it("blocks render for degraded phases", () => {
      expect(shouldBlockMemberOnlyRouteContent(states.degradedStaleSharedNoIdentity, true)).toBe(true);
      expect(shouldBlockMemberOnlyRouteContent(states.degradedStaleShared, true)).toBe(true);
    });

    it("allows render for confirmed member access", () => {
      expect(shouldBlockMemberOnlyRouteContent(states.readyMember, true)).toBe(false);
    });
  });

  describe("isMemberOnlyRoute: false", () => {
    it("never blocks render, allowing child recovery paths", () => {
      for (const route of Object.values(states)) {
        expect(shouldBlockMemberOnlyRouteContent(route, false)).toBe(false);
      }
    });
  });
});

describe("combined gating scenarios", () => {
  it("/$bad-slug (index, member-only, error) -> redirect + block", () => {
    expect(shouldRedirectMemberOnlyRoute(states.errorNotFound, true)).toBe(true);
    expect(shouldBlockMemberOnlyRouteContent(states.errorNotFound, true)).toBe(true);
  });

  it("/$bad-slug/$pageId (page, not member-only, error) -> no redirect, no block (recovery possible)", () => {
    expect(shouldRedirectMemberOnlyRoute(states.errorNotFound, false)).toBe(false);
    expect(shouldBlockMemberOnlyRouteContent(states.errorNotFound, false)).toBe(false);
  });

  it("/$valid-slug/settings with shared access (member-only) -> redirect + block", () => {
    expect(shouldRedirectMemberOnlyRoute(states.readyShared, true)).toBe(true);
    expect(shouldBlockMemberOnlyRouteContent(states.readyShared, true)).toBe(true);
  });

  it("/$unknown-slug (member-only degraded) -> redirect + block", () => {
    expect(shouldRedirectMemberOnlyRoute(states.degradedStaleSharedNoIdentity, true)).toBe(true);
    expect(shouldBlockMemberOnlyRouteContent(states.degradedStaleSharedNoIdentity, true)).toBe(true);
  });

  it("/$valid-slug/$pageId with shared access (not member-only) -> no redirect (shared view allowed)", () => {
    expect(shouldRedirectMemberOnlyRoute(states.readyShared, false)).toBe(false);
    expect(shouldBlockMemberOnlyRouteContent(states.readyShared, false)).toBe(false);
  });

  it("/$valid-slug (member, member-only) -> normal render", () => {
    expect(shouldRedirectMemberOnlyRoute(states.readyMember, true)).toBe(false);
    expect(shouldBlockMemberOnlyRouteContent(states.readyMember, true)).toBe(false);
  });
});
