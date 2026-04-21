import { describe, expect, it } from "vitest";
import { deriveDocSyncPhase, type DocSyncPhaseInputs } from "@/client/lib/doc-sync-session";

const base: DocSyncPhaseInputs = {
  hasLocalBodyState: false,
  wantsConnection: true,
  workspaceId: "ws-1",
  bootstrapStatus: "pending",
};

describe("doc-sync cold bootstrap phase", () => {
  it("exposes local state when offline or unauthed without connecting", () => {
    expect(deriveDocSyncPhase({ ...base, wantsConnection: false })).toEqual({
      ready: true,
      shouldConnect: false,
      snapshotFetch: null,
      error: false,
    });
  });

  it("mounts and connects immediately when a local body is cached", () => {
    expect(deriveDocSyncPhase({ ...base, hasLocalBodyState: true })).toEqual({
      ready: true,
      shouldConnect: true,
      snapshotFetch: null,
      error: false,
    });
  });

  it("stays loading without a workspace id since the snapshot route is unreachable", () => {
    expect(deriveDocSyncPhase({ ...base, workspaceId: undefined })).toEqual({
      ready: false,
      shouldConnect: false,
      snapshotFetch: null,
      error: false,
    });
  });

  it("fetches a snapshot before mounting on a cold uncached live doc", () => {
    expect(deriveDocSyncPhase(base)).toEqual({
      ready: false,
      shouldConnect: false,
      snapshotFetch: { workspaceId: "ws-1" },
      error: false,
    });
  });

  it("mounts and connects once the snapshot has resolved (applied or absent)", () => {
    expect(deriveDocSyncPhase({ ...base, bootstrapStatus: "resolved" })).toEqual({
      ready: true,
      shouldConnect: true,
      snapshotFetch: null,
      error: false,
    });
  });

  it("surfaces an error state on snapshot failure and keeps the provider parked", () => {
    expect(deriveDocSyncPhase({ ...base, bootstrapStatus: "error" })).toEqual({
      ready: false,
      shouldConnect: false,
      snapshotFetch: null,
      error: true,
    });
  });
});
