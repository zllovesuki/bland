import { describe, expect, it } from "vitest";
import { createWorkspace } from "@tests/client/util/fixtures";
import { resolveRootWorkspaceDecision } from "@/client/lib/root-workspace-gateway";

describe("resolveRootWorkspaceDecision", () => {
  it("prefers the last visited workspace when it exists in the live list", () => {
    const preferred = createWorkspace({ id: "ws-2", slug: "preferred" });
    const liveWorkspaces = [createWorkspace({ id: "ws-1", slug: "first" }), preferred];

    expect(
      resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: "ws-2",
        cachedWorkspaces: [],
        liveWorkspaces,
      }),
    ).toEqual({
      kind: "redirect",
      workspace: preferred,
    });
  });

  it("falls back to the first live workspace when the last visited workspace is stale", () => {
    const liveWorkspace = createWorkspace({ id: "ws-1", slug: "first" });

    expect(
      resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: "ws-stale",
        cachedWorkspaces: [],
        liveWorkspaces: [liveWorkspace, createWorkspace({ id: "ws-2", slug: "second" })],
      }),
    ).toEqual({
      kind: "redirect",
      workspace: liveWorkspace,
    });
  });

  it("returns empty when the live list is confirmed empty", () => {
    expect(
      resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: "ws-1",
        cachedWorkspaces: [createWorkspace()],
        liveWorkspaces: [],
      }),
    ).toEqual({ kind: "empty" });
  });

  it("falls back to the cached last visited workspace when the live request fails", () => {
    const cachedWorkspace = createWorkspace({ id: "ws-2", slug: "cached-preferred" });

    expect(
      resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: "ws-2",
        cachedWorkspaces: [createWorkspace({ id: "ws-1", slug: "first" }), cachedWorkspace],
        liveWorkspaces: null,
      }),
    ).toEqual({
      kind: "redirect",
      workspace: cachedWorkspace,
    });
  });

  it("returns unavailable when the cached last visited workspace is missing", () => {
    expect(
      resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: "ws-stale",
        cachedWorkspaces: [],
        liveWorkspaces: null,
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("falls back to first cached workspace when no lastVisitedWorkspaceId", () => {
    const cachedWorkspace = createWorkspace({ id: "ws-1", slug: "first" });

    expect(
      resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: null,
        cachedWorkspaces: [cachedWorkspace],
        liveWorkspaces: null,
      }),
    ).toEqual({
      kind: "redirect",
      workspace: cachedWorkspace,
    });
  });

  it("returns unavailable when there is no live response and no cached workspace", () => {
    expect(
      resolveRootWorkspaceDecision({
        lastVisitedWorkspaceId: null,
        cachedWorkspaces: [],
        liveWorkspaces: null,
      }),
    ).toEqual({ kind: "unavailable" });
  });
});
