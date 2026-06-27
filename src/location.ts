import * as Location from "expo-location";

// Wrapper around expo-location mirroring the web app's `navigator.geolocation`;
// location is supported on every native platform, so this is always true.
export const hasGeolocation = true;

export interface Position {
  lat: number;
  lon: number;
}

/** Prompt for foreground location permission. Returns true if granted. */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** Current granted/denied state without prompting. */
export async function checkLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** Get the current position, or null if unavailable / not permitted. */
export async function getCurrentPosition(): Promise<Position | null> {
  try {
    if (!(await checkLocationPermission())) return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

// Subscribe to position updates (returns an unsubscribe fn). Uses one long-lived
// CoreLocation subscription instead of timer polling, which froze the map's main thread.
export async function watchPosition(
  onChange: (pos: Position) => void,
): Promise<() => void> {
  try {
    if (!(await checkLocationPermission())) return () => {};
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 2000,
        distanceInterval: 1,
      },
      (loc) => {
        onChange({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      },
    );
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}
