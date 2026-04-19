import type YProvider from "y-partyserver/provider";

export type SyncStatus = "connected" | "connecting" | "disconnected";

export type SyncProviderLike = Pick<
  YProvider,
  "connect" | "disconnect" | "shouldConnect" | "wsconnected" | "wsconnecting" | "synced"
>;

interface DocSyncConnectionInput {
  online: boolean;
  shareToken?: string;
  accessToken?: string | null;
}

export function shouldConnectDocSyncProvider({ online, shareToken, accessToken }: DocSyncConnectionInput): boolean {
  return online && (!!shareToken || !!accessToken);
}

export function getDocSyncStatus(provider: SyncProviderLike | null, online: boolean): SyncStatus {
  if (!provider || !online) return "disconnected";
  if (provider.wsconnected) return "connected";
  if (provider.shouldConnect || provider.wsconnecting) return "connecting";
  return "disconnected";
}

export function reconcileDocSyncProvider(provider: SyncProviderLike | null, shouldConnect: boolean): void {
  if (!provider) return;

  if (shouldConnect) {
    if (provider.shouldConnect) return;
    void provider.connect().catch(() => {});
    return;
  }

  if (!provider.shouldConnect && !provider.wsconnecting && !provider.wsconnected) return;
  provider.disconnect();
}
