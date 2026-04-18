import { describe, expect, it } from "vitest";
import {
  getPageLoadFailureAction,
  needsRestrictedAncestors,
  type PageSurfaceKind,
} from "@/client/lib/page-surface-model";
import { SESSION_MODES } from "@/client/lib/constants";
import type { FailureKind } from "@/client/lib/classify-failure";

const SURFACES: PageSurfaceKind[] = ["canonical", "share"];

describe("getPageLoadFailureAction", () => {
  describe("forbidden", () => {
    it.each(SURFACES)("returns evict for %s surface regardless of connection", (surface) => {
      expect(getPageLoadFailureAction("forbidden", true, SESSION_MODES.AUTHENTICATED, surface)).toBe("evict");
      expect(getPageLoadFailureAction("forbidden", false, SESSION_MODES.AUTHENTICATED, surface)).toBe("evict");
      expect(getPageLoadFailureAction("forbidden", true, SESSION_MODES.LOCAL_ONLY, surface)).toBe("evict");
      expect(getPageLoadFailureAction("forbidden", true, SESSION_MODES.EXPIRED, surface)).toBe("evict");
    });
  });

  describe("not-found", () => {
    it.each(SURFACES)("is terminal on %s surface", (surface) => {
      expect(getPageLoadFailureAction("not-found", true, SESSION_MODES.AUTHENTICATED, surface)).toBe("terminal-gone");
      expect(getPageLoadFailureAction("not-found", false, SESSION_MODES.AUTHENTICATED, surface)).toBe("terminal-gone");
    });
  });

  describe("network", () => {
    it("falls back to cache on canonical surface", () => {
      expect(getPageLoadFailureAction("network", true, SESSION_MODES.AUTHENTICATED, "canonical")).toBe(
        "cache-fallback",
      );
      expect(getPageLoadFailureAction("network", false, SESSION_MODES.AUTHENTICATED, "canonical")).toBe(
        "cache-fallback",
      );
    });

    it("is terminal on share surface", () => {
      expect(getPageLoadFailureAction("network", true, SESSION_MODES.AUTHENTICATED, "share")).toBe("terminal-gone");
    });
  });

  describe("server / unknown / auth-ambiguous", () => {
    const kinds: FailureKind[] = ["server", "unknown", "auth-ambiguous"];

    it.each(kinds)("is terminal for %s on canonical + online + authenticated", (kind) => {
      expect(getPageLoadFailureAction(kind, true, SESSION_MODES.AUTHENTICATED, "canonical")).toBe("terminal-gone");
    });

    it.each(kinds)("falls back to cache for %s when canonical + offline", (kind) => {
      expect(getPageLoadFailureAction(kind, false, SESSION_MODES.AUTHENTICATED, "canonical")).toBe("cache-fallback");
    });

    it.each(kinds)("falls back to cache for %s when canonical + LOCAL_ONLY", (kind) => {
      expect(getPageLoadFailureAction(kind, true, SESSION_MODES.LOCAL_ONLY, "canonical")).toBe("cache-fallback");
    });

    it.each(kinds)("is terminal for %s on share surface regardless of connection", (kind) => {
      expect(getPageLoadFailureAction(kind, true, SESSION_MODES.AUTHENTICATED, "share")).toBe("terminal-gone");
      expect(getPageLoadFailureAction(kind, false, SESSION_MODES.AUTHENTICATED, "share")).toBe("terminal-gone");
    });
  });
});

describe("needsRestrictedAncestors", () => {
  it("returns true for shared access mode", () => {
    expect(needsRestrictedAncestors("shared", null)).toBe(true);
    expect(needsRestrictedAncestors("shared", "member")).toBe(true);
  });

  it("returns true for guest role regardless of access mode", () => {
    expect(needsRestrictedAncestors("member", "guest")).toBe(true);
    expect(needsRestrictedAncestors(null, "guest")).toBe(true);
  });

  it("returns false for member access with non-guest role", () => {
    expect(needsRestrictedAncestors("member", "owner")).toBe(false);
    expect(needsRestrictedAncestors("member", "admin")).toBe(false);
    expect(needsRestrictedAncestors("member", "member")).toBe(false);
  });

  it("returns false when both are null", () => {
    expect(needsRestrictedAncestors(null, null)).toBe(false);
  });
});
