import { describe, expect, it } from "vitest";
import { createWorkspace } from "@tests/client/util/fixtures";
import { resolveRootWorkspaceDecision } from "@/client/lib/root-workspace-gateway";

describe("resolveRootWorkspaceDecision", () => {
  it("prefers the current workspace when it exists in the live list", () => {
    const currentWorkspace = createWorkspace({ id: "ws-2", slug: "preferred" });
    const liveWorkspaces = [createWorkspace({ id: "ws-1", slug: "first" }), currentWorkspace];

    expect(
      resolveRootWorkspaceDecision({
        currentWorkspace,
        cachedWorkspaces: [],
        liveWorkspaces,
      }),
    ).toEqual({
      kind: "redirect",
      workspace: currentWorkspace,
    });
  });

  it("falls back to the first live workspace when the current workspace is stale", () => {
    const liveWorkspace = createWorkspace({ id: "ws-1", slug: "first" });

    expect(
      resolveRootWorkspaceDecision({
        currentWorkspace: createWorkspace({ id: "ws-stale", slug: "stale" }),
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
        currentWorkspace: createWorkspace(),
        cachedWorkspaces: [createWorkspace()],
        liveWorkspaces: [],
      }),
    ).toEqual({ kind: "empty" });
  });

  it("falls back to the cached current workspace when the live request fails", () => {
    const cachedWorkspace = createWorkspace({ id: "ws-2", slug: "cached-preferred" });

    expect(
      resolveRootWorkspaceDecision({
        currentWorkspace: cachedWorkspace,
        cachedWorkspaces: [createWorkspace({ id: "ws-1", slug: "first" }), cachedWorkspace],
        liveWorkspaces: null,
      }),
    ).toEqual({
      kind: "redirect",
      workspace: cachedWorkspace,
    });
  });

  it("returns unavailable when the cached current workspace is missing", () => {
    const cachedWorkspace = createWorkspace({ id: "ws-1", slug: "first" });

    expect(
      resolveRootWorkspaceDecision({
        currentWorkspace: createWorkspace({ id: "ws-stale", slug: "stale" }),
        cachedWorkspaces: [cachedWorkspace, createWorkspace({ id: "ws-2", slug: "second" })],
        liveWorkspaces: null,
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("returns unavailable when there is cached workspace data but no current workspace", () => {
    expect(
      resolveRootWorkspaceDecision({
        currentWorkspace: null,
        cachedWorkspaces: [createWorkspace({ id: "ws-1", slug: "first" })],
        liveWorkspaces: null,
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("returns unavailable when there is no live response and no cached workspace", () => {
    expect(
      resolveRootWorkspaceDecision({
        currentWorkspace: null,
        cachedWorkspaces: [],
        liveWorkspaces: null,
      }),
    ).toEqual({ kind: "unavailable" });
  });
});
