import { describe, expect, it } from "vitest";
import {
  deriveEditorPhase,
  hasLocalBodyState,
  type EditorPhaseInputs,
} from "@/client/components/editor/use-editor-session";

const base: EditorPhaseInputs = {
  hasLocalBodyState: false,
  wantsConnection: true,
  workspaceId: "ws-1",
  bootstrapStatus: "pending",
};

describe("editor cold bootstrap phase", () => {
  it("treats a fragment with children as locally cached body state", () => {
    expect(hasLocalBodyState({ length: 1 })).toBe(true);
    expect(hasLocalBodyState({ length: 0 })).toBe(false);
  });

  it("exposes local state when offline or unauthed without connecting", () => {
    expect(deriveEditorPhase({ ...base, wantsConnection: false })).toEqual({
      ready: true,
      shouldConnect: false,
      snapshotFetch: null,
      error: false,
    });
  });

  it("mounts and connects immediately when a local body is cached", () => {
    expect(deriveEditorPhase({ ...base, hasLocalBodyState: true })).toEqual({
      ready: true,
      shouldConnect: true,
      snapshotFetch: null,
      error: false,
    });
  });

  it("stays loading without a workspace id since the snapshot route is unreachable", () => {
    expect(deriveEditorPhase({ ...base, workspaceId: undefined })).toEqual({
      ready: false,
      shouldConnect: false,
      snapshotFetch: null,
      error: false,
    });
  });

  it("fetches a snapshot before mounting on a cold uncached live doc", () => {
    expect(deriveEditorPhase(base)).toEqual({
      ready: false,
      shouldConnect: false,
      snapshotFetch: { workspaceId: "ws-1" },
      error: false,
    });
  });

  it("mounts and connects once the snapshot has resolved (applied or absent)", () => {
    expect(deriveEditorPhase({ ...base, bootstrapStatus: "resolved" })).toEqual({
      ready: true,
      shouldConnect: true,
      snapshotFetch: null,
      error: false,
    });
  });

  it("surfaces an error state on snapshot failure and keeps the provider parked", () => {
    expect(deriveEditorPhase({ ...base, bootstrapStatus: "error" })).toEqual({
      ready: false,
      shouldConnect: false,
      snapshotFetch: null,
      error: true,
    });
  });
});
