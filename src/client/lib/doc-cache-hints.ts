import { getCachedDocKey, STORAGE_KEYS } from "./constants";

function getSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_DOCS);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persist(set: Set<string>) {
  localStorage.setItem(STORAGE_KEYS.CACHED_DOCS, JSON.stringify([...set]));
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
  localStorage.removeItem(STORAGE_KEYS.CACHED_DOCS);
}

/** Clear hints and best-effort purge known Yjs IndexedDB docs. */
export function clearAllCachedDocs(): void {
  const pageIds = [...getSet()];
  localStorage.removeItem(STORAGE_KEYS.CACHED_DOCS);
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
