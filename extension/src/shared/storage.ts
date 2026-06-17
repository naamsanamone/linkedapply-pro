/* ============================================================
   LinkedApply Pro — Chrome Storage API Wrapper
   Typed, async wrapper around chrome.storage.local
   ============================================================ */

import { STORAGE_KEYS } from './constants';

type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/**
 * Get a value from chrome.storage.local
 */
export async function getStorage<T>(key: StorageKey): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? null);
    });
  });
}

/**
 * Set a value in chrome.storage.local
 */
export async function setStorage<T>(key: StorageKey, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

/**
 * Remove a value from chrome.storage.local
 */
export async function removeStorage(key: StorageKey): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, resolve);
  });
}

/**
 * Get multiple values at once
 */
export async function getMultipleStorage<T extends Record<string, any>>(
  keys: StorageKey[]
): Promise<Partial<T>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as Partial<T>);
    });
  });
}

/**
 * Clear all extension storage
 */
export async function clearAllStorage(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

/**
 * Listen for storage changes
 */
export function onStorageChanged(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      callback(changes);
    }
  });
}

/**
 * Update a stored object partially (merge)
 */
export async function updateStorage<T extends Record<string, any>>(
  key: StorageKey,
  updates: Partial<T>
): Promise<void> {
  const current = await getStorage<T>(key);
  const merged = { ...(current || {}), ...updates } as T;
  await setStorage(key, merged);
}
