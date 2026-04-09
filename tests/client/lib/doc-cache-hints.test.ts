import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";

let markDocCached: typeof import("@/client/lib/doc-cache-hints").markDocCached;
let isDocCached: typeof import("@/client/lib/doc-cache-hints").isDocCached;
let removeDocHint: typeof import("@/client/lib/doc-cache-hints").removeDocHint;
let clearDocHints: typeof import("@/client/lib/doc-cache-hints").clearDocHints;
let clearAllCachedDocs: typeof import("@/client/lib/doc-cache-hints").clearAllCachedDocs;

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  const mod = await import("@/client/lib/doc-cache-hints");
  markDocCached = mod.markDocCached;
  isDocCached = mod.isDocCached;
  removeDocHint = mod.removeDocHint;
  clearDocHints = mod.clearDocHints;
  clearAllCachedDocs = mod.clearAllCachedDocs;
});

afterEach(() => {
  restoreLocalStorage();
  vi.restoreAllMocks();
});

describe("doc-cache-hints", () => {
  describe("markDocCached / isDocCached", () => {
    it("marks a doc as cached and reads it back", () => {
      expect(isDocCached("p1")).toBe(false);
      markDocCached("p1");
      expect(isDocCached("p1")).toBe(true);
    });

    it("is idempotent — marking the same doc twice does not duplicate", () => {
      markDocCached("p1");
      markDocCached("p1");
      const raw = localStorage.getItem("bland:cached-docs");
      expect(JSON.parse(raw!)).toEqual(["p1"]);
    });

    it("tracks multiple docs independently", () => {
      markDocCached("p1");
      markDocCached("p2");
      expect(isDocCached("p1")).toBe(true);
      expect(isDocCached("p2")).toBe(true);
      expect(isDocCached("p3")).toBe(false);
    });
  });

  describe("removeDocHint", () => {
    it("removes a cached doc hint", () => {
      markDocCached("p1");
      markDocCached("p2");
      removeDocHint("p1");
      expect(isDocCached("p1")).toBe(false);
      expect(isDocCached("p2")).toBe(true);
    });

    it("no-ops when doc was never cached", () => {
      removeDocHint("p1");
      expect(isDocCached("p1")).toBe(false);
    });
  });

  describe("clearDocHints", () => {
    it("removes all hints from localStorage", () => {
      markDocCached("p1");
      markDocCached("p2");
      clearDocHints();
      expect(isDocCached("p1")).toBe(false);
      expect(isDocCached("p2")).toBe(false);
      expect(localStorage.getItem("bland:cached-docs")).toBeNull();
    });
  });

  describe("clearAllCachedDocs", () => {
    it("clears hints and calls clearDocument for each cached page", async () => {
      const clearDocument = vi.fn().mockResolvedValue(undefined);
      vi.doMock("y-indexeddb", () => ({ clearDocument }));

      markDocCached("p1");
      markDocCached("p2");
      clearAllCachedDocs();

      // Wait for dynamic import to settle
      await vi.dynamicImportSettled();
      expect(clearDocument).toHaveBeenCalledWith("bland:doc:p1");
      expect(clearDocument).toHaveBeenCalledWith("bland:doc:p2");
      expect(localStorage.getItem("bland:cached-docs")).toBeNull();
    });

    it("does not throw when y-indexeddb import fails", () => {
      vi.doMock("y-indexeddb", () => {
        throw new Error("module not found");
      });

      markDocCached("p1");
      expect(() => clearAllCachedDocs()).not.toThrow();
      expect(localStorage.getItem("bland:cached-docs")).toBeNull();
    });

    it("does not throw when clearDocument rejects", async () => {
      const clearDocument = vi.fn().mockRejectedValue(new Error("IDB error"));
      vi.doMock("y-indexeddb", () => ({ clearDocument }));

      markDocCached("p1");
      expect(() => clearAllCachedDocs()).not.toThrow();
      await vi.dynamicImportSettled();
      expect(clearDocument).toHaveBeenCalledWith("bland:doc:p1");
    });

    it("skips clearDocument when no docs are cached", async () => {
      const clearDocument = vi.fn();
      vi.doMock("y-indexeddb", () => ({ clearDocument }));

      clearAllCachedDocs();
      await vi.dynamicImportSettled();
      expect(clearDocument).not.toHaveBeenCalled();
    });
  });

  describe("malformed localStorage", () => {
    it("returns empty set when JSON is malformed", () => {
      localStorage.setItem("bland:cached-docs", "{not-valid-json");
      expect(isDocCached("p1")).toBe(false);
    });

    it("allows marking after recovering from malformed data", () => {
      localStorage.setItem("bland:cached-docs", "null");
      markDocCached("p1");
      expect(isDocCached("p1")).toBe(true);
    });
  });
});
