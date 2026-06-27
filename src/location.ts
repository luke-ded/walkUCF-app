import * as Location from "expo-location";

/**
 * Wrapper around expo-location that mirrors how the web app used
 * `navigator.geolocation`. Location is supported on every native platform,
 * so `hasGeolocation` is always true here.
 */
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

/**
 * Subscribe to position updates and invoke `onChange` whenever the device
 * moves. Returns a function that stops watching.
 *
 * This uses a single long-lived CoreLocation subscription instead of polling
 * `getCurrentPositionAsync` on a timer. Repeated polling forces synchronous
 * `CLLocationManager` authorization-status checks on the main thread (the
 * source of the "can cause UI unresponsiveness" warnings) and freezes the map;
 * a watch subscription delivers updates asynchronously without that cost.
 */
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
