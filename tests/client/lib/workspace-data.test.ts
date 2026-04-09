import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, createMember } from "@tests/client/util/fixtures";
import type { WorkspaceAccessMode } from "@/client/lib/workspace-data";

let bootstrapWorkspaceData: typeof import("@/client/lib/workspace-data").bootstrapWorkspaceData;

const mockPages = [createPage({ id: "p1" }), createPage({ id: "p2" })];
const mockMembers = [createMember({ user_id: "u1" })];

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("@/client/lib/api", () => ({
    api: {
      pages: { list: vi.fn().mockResolvedValue(mockPages) },
      workspaces: { members: vi.fn().mockResolvedValue(mockMembers) },
    },
  }));
  const mod = await import("@/client/lib/workspace-data");
  bootstrapWorkspaceData = mod.bootstrapWorkspaceData;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockStore() {
  return {
    setAccessMode: vi.fn(),
    setPages: vi.fn(),
    setMembers: vi.fn(),
  };
}

describe("bootstrapWorkspaceData", () => {
  it("fetches only pages for shared access mode", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "shared");

    expect(store.setAccessMode).toHaveBeenCalledWith("shared");
    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith([]);
  });

  it("fetches pages and members for member access mode", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "member");

    expect(store.setAccessMode).toHaveBeenCalledWith("member");
    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith(mockMembers);
  });

  it("skips store writes when shouldSkipApply returns true (shared)", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "shared", () => true);

    expect(store.setAccessMode).toHaveBeenCalledWith("shared");
    expect(store.setPages).not.toHaveBeenCalled();
  });

  it("skips store writes when shouldSkipApply returns true (member)", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "member", () => true);

    expect(store.setAccessMode).toHaveBeenCalledWith("member");
    expect(store.setPages).not.toHaveBeenCalled();
    expect(store.setMembers).not.toHaveBeenCalled();
  });

  it("applies writes when shouldSkipApply returns false", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "member", () => false);

    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith(mockMembers);
  });
});
