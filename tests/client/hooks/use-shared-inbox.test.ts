import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import type { SharedPagesResponse, SharedWithMeItem } from "@/shared/types";

const sharedWithMeMock = vi.fn();

vi.mock("@/client/lib/api", () => ({
  api: {
    shares: {
      sharedWithMe: sharedWithMeMock,
    },
  },
}));

let fetchSharedInbox: typeof import("@/client/hooks/use-shared-inbox").fetchSharedInbox;
let useWorkspaceStore: typeof import("@/client/stores/workspace-store").useWorkspaceStore;

const ITEM: SharedWithMeItem = {
  page_id: "p1",
  title: "Shared Page",
  icon: null,
  cover_url: null,
  workspace: { id: "ws-1", name: "WS", slug: "ws", icon: null, role: null },
  permission: "view",
  shared_by: "user-2",
  shared_by_name: "Alice",
  shared_at: "2026-04-01T00:00:00.000Z",
};

function response(items: SharedWithMeItem[]): SharedPagesResponse {
  return { items, workspace_summaries: [] };
}

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  sharedWithMeMock.mockReset();
  const hookMod = await import("@/client/hooks/use-shared-inbox");
  const wsMod = await import("@/client/stores/workspace-store");
  fetchSharedInbox = hookMod.fetchSharedInbox;
  useWorkspaceStore = wsMod.useWorkspaceStore;
});

afterEach(() => {
  restoreLocalStorage();
  vi.restoreAllMocks();
});

describe("fetchSharedInbox", () => {
  it("dedupes concurrent calls into a single API request", async () => {
    let resolveApi!: (payload: SharedPagesResponse) => void;
    sharedWithMeMock.mockImplementationOnce(
      () =>
        new Promise<SharedPagesResponse>((resolve) => {
          resolveApi = resolve;
        }),
    );

    const first = fetchSharedInbox();
    const second = fetchSharedInbox();

    expect(sharedWithMeMock).toHaveBeenCalledTimes(1);

    resolveApi(response([ITEM]));

    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.items).toEqual([ITEM]);
    expect(secondResponse.items).toEqual([ITEM]);
    expect(useWorkspaceStore.getState().sharedInbox).toEqual([ITEM]);
    expect(useWorkspaceStore.getState().sharedInboxWorkspaceSummaries).toEqual([]);
  });

  it("starts a fresh fetch after a previous call resolves", async () => {
    sharedWithMeMock.mockResolvedValueOnce(response([ITEM]));
    await fetchSharedInbox();
    expect(sharedWithMeMock).toHaveBeenCalledTimes(1);

    sharedWithMeMock.mockResolvedValueOnce(response([{ ...ITEM, page_id: "p2", title: "Second" }]));
    const result = await fetchSharedInbox();
    expect(sharedWithMeMock).toHaveBeenCalledTimes(2);
    expect(result.items[0]?.page_id).toBe("p2");
  });

  it("clears the in-flight slot when the API rejects, allowing a retry", async () => {
    sharedWithMeMock.mockRejectedValueOnce(new Error("network"));
    await expect(fetchSharedInbox()).rejects.toThrow("network");

    sharedWithMeMock.mockResolvedValueOnce(response([ITEM]));
    const result = await fetchSharedInbox();
    expect(result.items).toEqual([ITEM]);
    expect(sharedWithMeMock).toHaveBeenCalledTimes(2);
  });

  it("stores both cross-workspace items and same-workspace summaries into Zustand", async () => {
    sharedWithMeMock.mockResolvedValueOnce({
      items: [ITEM],
      workspace_summaries: [{ workspace: { id: "ws-2", name: "Home", slug: "home", icon: null }, count: 3 }],
    });

    const result = await fetchSharedInbox();
    expect(result.workspace_summaries).toHaveLength(1);
    expect(useWorkspaceStore.getState().sharedInboxWorkspaceSummaries).toEqual([
      { workspace: { id: "ws-2", name: "Home", slug: "home", icon: null }, count: 3 },
    ]);
  });
});
