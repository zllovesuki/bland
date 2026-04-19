import { getCachedDocKey, STORAGE_KEYS } from "./constants";
import { readVersionedStorageJson, writeVersionedStorageJson, removeStorageItem } from "./storage";

const DOC_CACHE_HINTS_VERSION = 1;

function parsePageIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function getSet(): Set<string> {
  const pageIds = readVersionedStorageJson(STORAGE_KEYS.CACHED_DOCS, DOC_CACHE_HINTS_VERSION, parsePageIds) ?? [];
  return new Set(pageIds);
}

function persist(set: Set<string>) {
  writeVersionedStorageJson(STORAGE_KEYS.CACHED_DOCS, DOC_CACHE_HINTS_VERSION, [...set]);
}

export function markDocCached(pageId: string): void {
  const set = getSet();
  if (!set.has(pageId)) {
    set.add(pageId);
    persist(set);
  }
}

export function isDocCached(pageId: string): boolean {
  return getSet().has(pageId);
}

export function removeDocHint(pageId: string): void {
  const set = getSet();
  if (set.delete(pageId)) {
    persist(set);
  }
}

export function clearDocHints(): void {
  removeStorageItem(STORAGE_KEYS.CACHED_DOCS);
}

/** Clear hints and best-effort purge known Yjs IndexedDB docs. */
export function clearAllCachedDocs(): void {
  const pageIds = [...getSet()];
  removeStorageItem(STORAGE_KEYS.CACHED_DOCS);
  if (pageIds.length > 0) {
    import("y-indexeddb")
      .then((m) => {
        for (const id of pageIds) {
          m.clearDocument(getCachedDocKey(id)).catch(() => {});
        }
      })
      .catch(() => {});
  }
}
