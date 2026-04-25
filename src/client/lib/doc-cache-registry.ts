import { getCachedCanvasKey, getCachedDocKey, STORAGE_KEYS } from "./constants";
import { readVersionedStorageJson, writeVersionedStorageJson, removeStorageItem } from "./storage";

const VERSION = 1;

function parsePageIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function getSet(): Set<string> {
  const pageIds = readVersionedStorageJson(STORAGE_KEYS.CACHED_DOCS, VERSION, parsePageIds) ?? [];
  return new Set(pageIds);
}

function persist(set: Set<string>) {
  writeVersionedStorageJson(STORAGE_KEYS.CACHED_DOCS, VERSION, [...set]);
}

function dropIndexedDbCaches(pageIds: string[]): void {
  if (pageIds.length === 0) return;
  import("y-indexeddb")
    .then((m) => {
      for (const id of pageIds) {
        m.clearDocument(getCachedDocKey(id)).catch(() => {});
        m.clearDocument(getCachedCanvasKey(id)).catch(() => {});
      }
    })
    .catch(() => {});
}

/**
 * Authoritative registry for "this page's Yjs state is persisted locally." Owns
 * both the localStorage hint set and the `y-indexeddb` lifecycle for the doc
 * and canvas namespaces of listed pages. Callers should not import
 * `y-indexeddb` directly for eviction — use {@link docCache.remove} instead,
 * so a single call clears every persisted namespace for the page id.
 *
 * Cleanup is fire-and-forget: IDB purges are dispatched but not awaited, so
 * callers don't block user flows on storage housekeeping.
 */
export const docCache = {
  has(pageId: string): boolean {
    return getSet().has(pageId);
  },

  mark(pageId: string): void {
    const set = getSet();
    if (!set.has(pageId)) {
      set.add(pageId);
      persist(set);
    }
  },

  remove(pageId: string): void {
    const set = getSet();
    if (set.delete(pageId)) {
      persist(set);
    }
    dropIndexedDbCaches([pageId]);
  },

  clearAll(): void {
    const pageIds = [...getSet()];
    removeStorageItem(STORAGE_KEYS.CACHED_DOCS);
    dropIndexedDbCaches(pageIds);
  },
};
