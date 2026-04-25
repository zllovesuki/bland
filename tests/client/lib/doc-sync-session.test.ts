import { describe, expect, it } from "vitest";
import {
  decideDocSyncRefresh,
  deriveDocSyncPhase,
  type DocSyncPhaseInputs,
  type DocSyncRefreshDecisionInput,
} from "@/client/lib/doc-sync-session";

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

describe("decideDocSyncRefresh", () => {
  const baseInput: DocSyncRefreshDecisionInput = {
    isOnline: true,
    isProviderActive: true,
    hasShareToken: false,
    currentAccessToken: "T1",
    lastRefreshAttemptedFor: null,
  };

  it("skips when offline so a parked provider does not burn refresh budget", () => {
    expect(decideDocSyncRefresh({ ...baseInput, isOnline: false })).toEqual({
      kind: "skip",
      reason: "offline",
    });
  });

  it("skips when the session is no longer active (cleanup or disabled)", () => {
    expect(decideDocSyncRefresh({ ...baseInput, isProviderActive: false })).toEqual({
      kind: "skip",
      reason: "inactive",
    });
  });

  it("skips share-token sessions even when an authenticated bearer is present", () => {
    expect(decideDocSyncRefresh({ ...baseInput, hasShareToken: true })).toEqual({
      kind: "skip",
      reason: "share",
    });
  });

  it("skips when there is no access token to refresh against", () => {
    expect(decideDocSyncRefresh({ ...baseInput, currentAccessToken: null })).toEqual({
      kind: "skip",
      reason: "no_token",
    });
  });

  it("skips when refresh has already been attempted for this token value", () => {
    expect(decideDocSyncRefresh({ ...baseInput, lastRefreshAttemptedFor: "T1" })).toEqual({
      kind: "skip",
      reason: "already_attempted",
    });
  });

  it("triggers a refresh on first close for an authenticated session", () => {
    expect(decideDocSyncRefresh(baseInput)).toEqual({
      kind: "refresh",
      tokenAtAttempt: "T1",
    });
  });

  it("allows a refresh against a freshly rotated token when the prior attempt was for the old token", () => {
    expect(decideDocSyncRefresh({ ...baseInput, currentAccessToken: "T2", lastRefreshAttemptedFor: "T1" })).toEqual({
      kind: "refresh",
      tokenAtAttempt: "T2",
    });
  });
});
