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
