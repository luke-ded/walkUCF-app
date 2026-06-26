import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The web app uses the browser's synchronous `localStorage` everywhere
 * (getItem / setItem in render bodies, etc.). React Native only ships an
 * async key/value store. To keep the components as close to the web version
 * as possible, this module exposes a synchronous `localStorage`-like API
 * backed by an in-memory cache that is hydrated from AsyncStorage once on
 * startup and written through asynchronously on every change.
 */
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
