import { createJSONStorage, type StateStorage } from "zustand/middleware";

interface VersionedEnvelope<T> {
  version: number;
  value: T;
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isVersionedEnvelope<T>(value: unknown, version: number): value is VersionedEnvelope<T> {
  return !!value && typeof value === "object" && "version" in value && "value" in value && value.version === version;
}

export function readStorageString(key: string): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageString(key: string, value: string): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageItem(key: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

export function readStorageJson<T>(key: string, parseValue: (value: unknown) => T | null): T | null {
  const raw = readStorageString(key);
  if (!raw) return null;
  try {
    return parseValue(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeStorageJson<T>(key: string, value: T): boolean {
  try {
    return writeStorageString(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

export function readVersionedStorageJson<T>(
  key: string,
  version: number,
  parseValue: (value: unknown) => T | null,
): T | null {
  return readStorageJson(key, (value) => {
    if (isVersionedEnvelope<T>(value, version)) {
      return parseValue(value.value);
    }
    return parseValue(value);
  });
}

export function writeVersionedStorageJson<T>(key: string, version: number, value: T): boolean {
  return writeStorageJson<VersionedEnvelope<T>>(key, { version, value });
}

export const safeStateStorage: StateStorage = {
  getItem: (name) => readStorageString(name),
  setItem: (name, value) => {
    writeStorageString(name, value);
  },
  removeItem: (name) => {
    removeStorageItem(name);
  },
};

export const safeJsonStorage = createJSONStorage(() => safeStateStorage);
