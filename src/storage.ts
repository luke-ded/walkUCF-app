import AsyncStorage from "@react-native-async-storage/async-storage";

// Synchronous `localStorage`-like API (matching the web app) backed by an in-memory
// cache, hydrated from AsyncStorage on startup and written through asynchronously.
const cache: Record<string, string> = {};

export const localStorage = {
  getItem(key: string): string | null {
    return key in cache ? cache[key] : null;
  },
  setItem(key: string, value: string): void {
    cache[key] = value;
    AsyncStorage.setItem(key, value).catch(() => {});
  },
  removeItem(key: string): void {
    delete cache[key];
    AsyncStorage.removeItem(key).catch(() => {});
  },
};

/** Load all persisted values into the in-memory cache. Call before render. */
export async function hydrateStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    if (keys.length === 0) return;
    const entries = await AsyncStorage.multiGet(keys);
    entries.forEach(([key, value]) => {
      if (value != null) cache[key] = value;
    });
  } catch {
    // Ignore hydration errors; defaults will be written on first render.
  }
}
