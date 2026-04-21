import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";

let docCache: typeof import("@/client/lib/doc-cache-registry").docCache;

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  const mod = await import("@/client/lib/doc-cache-registry");
  docCache = mod.docCache;
});

afterEach(() => {
  restoreLocalStorage();
  vi.restoreAllMocks();
});

describe("docCache.mark / docCache.has", () => {
  it("marks a doc as cached and reads it back", () => {
    expect(docCache.has("p1")).toBe(false);
    docCache.mark("p1");
    expect(docCache.has("p1")).toBe(true);
  });

  it("is idempotent — marking the same doc twice does not duplicate", () => {
    docCache.mark("p1");
    docCache.mark("p1");
    const raw = localStorage.getItem("bland:cached-docs");
    expect(JSON.parse(raw!)).toEqual({ version: 1, value: ["p1"] });
  });

  it("tracks multiple docs independently", () => {
    docCache.mark("p1");
    docCache.mark("p2");
    expect(docCache.has("p1")).toBe(true);
    expect(docCache.has("p2")).toBe(true);
    expect(docCache.has("p3")).toBe(false);
  });
});

describe("docCache.remove", () => {
  it("removes the hint and dispatches an IndexedDB clear for the doc", async () => {
    const clearDocument = vi.fn().mockResolvedValue(undefined);
    vi.doMock("y-indexeddb", () => ({ clearDocument }));

    docCache.mark("p1");
    docCache.mark("p2");
    docCache.remove("p1");

    expect(docCache.has("p1")).toBe(false);
    expect(docCache.has("p2")).toBe(true);
    await vi.dynamicImportSettled();
    expect(clearDocument).toHaveBeenCalledWith("bland:doc:p1");
  });

  it("no-ops cleanly when the doc was never cached", async () => {
    const clearDocument = vi.fn().mockResolvedValue(undefined);
    vi.doMock("y-indexeddb", () => ({ clearDocument }));

    expect(() => docCache.remove("p1")).not.toThrow();
    expect(docCache.has("p1")).toBe(false);
    // Fires IDB clear best-effort even if the hint set didn't track the id —
    // handles cases where the hint was already pruned but the IDB doc remains.
    await vi.dynamicImportSettled();
    expect(clearDocument).toHaveBeenCalledWith("bland:doc:p1");
  });

  it("does not throw when y-indexeddb import fails", () => {
    vi.doMock("y-indexeddb", () => {
      throw new Error("module not found");
    });

    docCache.mark("p1");
    expect(() => docCache.remove("p1")).not.toThrow();
  });
});

describe("docCache.clearAll", () => {
  it("clears hints and calls clearDocument for each cached page", async () => {
    const clearDocument = vi.fn().mockResolvedValue(undefined);
    vi.doMock("y-indexeddb", () => ({ clearDocument }));

    docCache.mark("p1");
    docCache.mark("p2");
    docCache.clearAll();

    await vi.dynamicImportSettled();
    expect(clearDocument).toHaveBeenCalledWith("bland:doc:p1");
    expect(clearDocument).toHaveBeenCalledWith("bland:doc:p2");
    expect(localStorage.getItem("bland:cached-docs")).toBeNull();
  });

  it("does not throw when y-indexeddb import fails", () => {
    vi.doMock("y-indexeddb", () => {
      throw new Error("module not found");
    });

    docCache.mark("p1");
    expect(() => docCache.clearAll()).not.toThrow();
    expect(localStorage.getItem("bland:cached-docs")).toBeNull();
  });

  it("does not throw when clearDocument rejects", async () => {
    const clearDocument = vi.fn().mockRejectedValue(new Error("IDB error"));
    vi.doMock("y-indexeddb", () => ({ clearDocument }));

    docCache.mark("p1");
    expect(() => docCache.clearAll()).not.toThrow();
    await vi.dynamicImportSettled();
    expect(clearDocument).toHaveBeenCalledWith("bland:doc:p1");
  });

  it("skips clearDocument when no docs are cached", async () => {
    const clearDocument = vi.fn();
    vi.doMock("y-indexeddb", () => ({ clearDocument }));

    docCache.clearAll();
    await vi.dynamicImportSettled();
    expect(clearDocument).not.toHaveBeenCalled();
  });
});

describe("malformed localStorage", () => {
  it("returns empty set when JSON is malformed", () => {
    localStorage.setItem("bland:cached-docs", "{not-valid-json");
    expect(docCache.has("p1")).toBe(false);
  });

  it("allows marking after recovering from malformed data", () => {
    localStorage.setItem("bland:cached-docs", "null");
    docCache.mark("p1");
    expect(docCache.has("p1")).toBe(true);
  });
});
