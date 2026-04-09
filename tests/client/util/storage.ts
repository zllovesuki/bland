/**
 * In-memory localStorage stub for tests.
 * Install with `installLocalStorageStub()` / restore with `restoreLocalStorage()`.
 */
const store = new Map<string, string>();

const stub: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
};

let installed = false;
let hadOriginal = false;
let original: Storage | undefined;

export function installLocalStorageStub() {
  hadOriginal = "localStorage" in globalThis;
  original = globalThis.localStorage;
  installed = true;
  Object.defineProperty(globalThis, "localStorage", { value: stub, writable: true, configurable: true });
  store.clear();
}

export function restoreLocalStorage() {
  if (installed) {
    if (hadOriginal) {
      Object.defineProperty(globalThis, "localStorage", { value: original, writable: true, configurable: true });
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
    installed = false;
    hadOriginal = false;
    original = undefined;
  }
  store.clear();
}
