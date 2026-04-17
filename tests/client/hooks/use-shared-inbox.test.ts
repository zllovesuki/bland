import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import type { SharedWithMeItem } from "@/shared/types";

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
    let resolveApi!: (items: SharedWithMeItem[]) => void;
    sharedWithMeMock.mockImplementationOnce(
      () =>
        new Promise<SharedWithMeItem[]>((resolve) => {
          resolveApi = resolve;
        }),
    );

    const first = fetchSharedInbox();
    const second = fetchSharedInbox();

    expect(sharedWithMeMock).toHaveBeenCalledTimes(1);

    resolveApi([ITEM]);

    const [firstItems, secondItems] = await Promise.all([first, second]);

    expect(firstItems).toEqual([ITEM]);
    expect(secondItems).toEqual([ITEM]);
    expect(useWorkspaceStore.getState().sharedInbox).toEqual([ITEM]);
  });

  it("starts a fresh fetch after a previous call resolves", async () => {
    sharedWithMeMock.mockResolvedValueOnce([ITEM]);
    await fetchSharedInbox();
    expect(sharedWithMeMock).toHaveBeenCalledTimes(1);

    sharedWithMeMock.mockResolvedValueOnce([{ ...ITEM, page_id: "p2", title: "Second" }]);
    const items = await fetchSharedInbox();
    expect(sharedWithMeMock).toHaveBeenCalledTimes(2);
    expect(items[0]?.page_id).toBe("p2");
  });

  it("clears the in-flight slot when the API rejects, allowing a retry", async () => {
    sharedWithMeMock.mockRejectedValueOnce(new Error("network"));
    await expect(fetchSharedInbox()).rejects.toThrow("network");

    sharedWithMeMock.mockResolvedValueOnce([ITEM]);
    const items = await fetchSharedInbox();
    expect(items).toEqual([ITEM]);
    expect(sharedWithMeMock).toHaveBeenCalledTimes(2);
  });
});
