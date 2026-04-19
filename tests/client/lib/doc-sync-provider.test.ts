import { describe, expect, it, vi } from "vitest";
import {
  getDocSyncStatus,
  reconcileDocSyncProvider,
  shouldConnectDocSyncProvider,
  type SyncProviderLike,
} from "@/client/lib/doc-sync-provider";

function createProvider(overrides: Partial<SyncProviderLike> = {}): SyncProviderLike {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    shouldConnect: false,
    wsconnected: false,
    wsconnecting: false,
    synced: false,
    ...overrides,
  };
}

describe("shouldConnectDocSyncProvider", () => {
  it("requires the browser to be online", () => {
    expect(
      shouldConnectDocSyncProvider({
        online: false,
        accessToken: "token",
      }),
    ).toBe(false);
  });

  it("connects authenticated workspace sessions when online", () => {
    expect(
      shouldConnectDocSyncProvider({
        online: true,
        accessToken: "token",
      }),
    ).toBe(true);
  });

  it("connects shared sessions when online", () => {
    expect(
      shouldConnectDocSyncProvider({
        online: true,
        shareToken: "share-token",
      }),
    ).toBe(true);
  });

  it("stays disconnected without any auth material", () => {
    expect(
      shouldConnectDocSyncProvider({
        online: true,
      }),
    ).toBe(false);
  });
});

describe("getDocSyncStatus", () => {
  it("reports disconnected when the browser is offline", () => {
    expect(getDocSyncStatus(createProvider({ wsconnected: true }), false)).toBe("disconnected");
  });

  it("reports connected for an active websocket", () => {
    expect(getDocSyncStatus(createProvider({ wsconnected: true, shouldConnect: true }), true)).toBe("connected");
  });

  it("reports connecting while the provider intends to reconnect", () => {
    expect(getDocSyncStatus(createProvider({ shouldConnect: true }), true)).toBe("connecting");
  });

  it("reports disconnected for an intentionally parked provider", () => {
    expect(getDocSyncStatus(createProvider(), true)).toBe("disconnected");
  });
});

describe("reconcileDocSyncProvider", () => {
  it("connects once when the provider should become live", () => {
    const provider = createProvider();

    reconcileDocSyncProvider(provider, true);

    expect(provider.connect).toHaveBeenCalledTimes(1);
    expect(provider.disconnect).not.toHaveBeenCalled();
  });

  it("does not reconnect an already-live provider", () => {
    const provider = createProvider({ shouldConnect: true, wsconnecting: true });

    reconcileDocSyncProvider(provider, true);

    expect(provider.connect).not.toHaveBeenCalled();
    expect(provider.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects a provider that should stop syncing", () => {
    const provider = createProvider({ shouldConnect: true, wsconnected: true });

    reconcileDocSyncProvider(provider, false);

    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(provider.connect).not.toHaveBeenCalled();
  });

  it("leaves an already-disconnected provider alone", () => {
    const provider = createProvider();

    reconcileDocSyncProvider(provider, false);

    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(provider.connect).not.toHaveBeenCalled();
  });
});
