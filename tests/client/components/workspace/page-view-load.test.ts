import { describe, expect, it } from "vitest";
import { getPageLoadTarget } from "@/client/lib/page-load-target";
import { SESSION_MODES } from "@/client/lib/constants";
import type { WorkspaceRouteState } from "@/client/lib/workspace-route-model";
import { createPage, createWorkspace } from "@tests/client/util/fixtures";

const workspace = createWorkspace({ id: "ws-1", slug: "docs" });
const cachedPage = createPage({ id: "page-1", workspace_id: workspace.id });

describe("getPageLoadTarget", () => {
  it("uses cached page content for degraded routes when offline and both metadata and Yjs content are cached", () => {
    const route: WorkspaceRouteState = {
      phase: "degraded",
      workspaceId: null,
      workspaceSlug: "docs",
      reason: "stale-shared",
    };

    expect(
      getPageLoadTarget({
        surface: "canonical",
        route,
        online: false,
        sessionMode: SESSION_MODES.AUTHENTICATED,
        cachedPage,
        docCached: true,
        workspaceId: cachedPage.workspace_id,
      }),
    ).toBe("cached-page");
  });

  it("uses cached page content for stale-shared routes in local-only mode", () => {
    const route: WorkspaceRouteState = {
      phase: "degraded",
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      reason: "stale-shared",
    };

    expect(
      getPageLoadTarget({
        surface: "canonical",
        route,
        online: true,
        sessionMode: SESSION_MODES.LOCAL_ONLY,
        cachedPage,
        docCached: true,
        workspaceId: cachedPage.workspace_id,
      }),
    ).toBe("cached-page");
  });

  it("shows offline unavailable when metadata exists but the cached Yjs doc does not", () => {
    const route: WorkspaceRouteState = {
      phase: "degraded",
      workspaceId: null,
      workspaceSlug: "docs",
      reason: "stale-shared",
    };

    expect(
      getPageLoadTarget({
        surface: "canonical",
        route,
        online: false,
        sessionMode: SESSION_MODES.AUTHENTICATED,
        cachedPage,
        docCached: false,
        workspaceId: cachedPage.workspace_id,
      }),
    ).toBe("offline-unavailable");
  });

  it("uses cached page content for degraded routes when online and authenticated if metadata and Yjs content are cached", () => {
    const route: WorkspaceRouteState = {
      phase: "degraded",
      workspaceId: null,
      workspaceSlug: "docs",
      reason: "stale-shared",
    };

    expect(
      getPageLoadTarget({
        surface: "canonical",
        route,
        online: true,
        sessionMode: SESSION_MODES.AUTHENTICATED,
        cachedPage,
        docCached: true,
        workspaceId: cachedPage.workspace_id,
      }),
    ).toBe("cached-page");
  });

  it("surfaces cache-unavailable when degraded routes are online but lack a cached Yjs doc", () => {
    const route: WorkspaceRouteState = {
      phase: "degraded",
      workspaceId: null,
      workspaceSlug: "docs",
      reason: "stale-shared",
    };

    expect(
      getPageLoadTarget({
        surface: "canonical",
        route,
        online: true,
        sessionMode: SESSION_MODES.AUTHENTICATED,
        cachedPage,
        docCached: false,
        workspaceId: cachedPage.workspace_id,
      }),
    ).toBe("cache-unavailable");
  });

  it("loads live page data once the workspace route is ready", () => {
    const route: WorkspaceRouteState = {
      phase: "ready",
      workspaceId: workspace.id,
      accessMode: "member",
    };

    expect(
      getPageLoadTarget({
        surface: "canonical",
        route,
        online: true,
        sessionMode: SESSION_MODES.AUTHENTICATED,
        cachedPage,
        docCached: true,
        workspaceId: workspace.id,
      }),
    ).toBe("live");
  });
});
