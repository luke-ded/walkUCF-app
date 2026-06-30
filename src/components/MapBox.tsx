import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Marker,
  Callout,
  Polyline,
  Polygon,
  UrlTile,
  Region,
  LatLng,
  PROVIDER_DEFAULT,
} from "react-native-maps";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { createGraph, dijkstra } from "./Dijkstra";
import { localStorage } from "../storage";
import { watchPosition } from "../location";
import { useTheme } from "../theme";
import { Item, Settings } from "../types";
import selectImage from "../assets/gold-select-marker-icon.png";
import standardImage from "../assets/standard-marker-icon.png";
import deselectImage from "../assets/gold-deselect-marker-icon.png";

interface ChildProps {
  triggerRerender: () => void;
  toggleError: (error: boolean) => void;
  stops: Item[];
  // Route-affecting options, owned by HomePage and passed down.
  buildings: boolean;
  jaywalking: boolean;
  grass: boolean;
  parking: boolean;
  // Safe-area top inset so the floating map controls clear the status bar.
  topInset: number;
  // Map height (px) hidden behind the minimized sheet; relaxes the south drag bound.
  obscuredBottom: number;
  // Whether foreground location permission is granted.
  locationGranted: boolean;
}

const displayAllPaths = false; // Change to true to view all paths

// Native base map (Apple/Google); the UrlTile stays mounted but hidden (opacity 0).
const NATIVE_MAP = "Native";

// Resolve the initial tile, migrating old "OSM Default" installs to the native default once.
const TILE_DEFAULT_VERSION = "nativeDefault-v1";
function resolveInitialTile(): string {
  if (localStorage.getItem("tileDefaultVersion") !== TILE_DEFAULT_VERSION) {
    localStorage.setItem("tileDefaultVersion", TILE_DEFAULT_VERSION);
    localStorage.setItem("tile", NATIVE_MAP);
    return NATIVE_MAP;
  }
  return localStorage.getItem("tile") ?? NATIVE_MAP;
}

const tileSelectionOptions = new Map<string, string>([
  [NATIVE_MAP, ""],
  ["OSM Default", "https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  [
    "ERSI Satellite",
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  ["Stadia", "https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png"],
  [
    "Carto",
    "https://a.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png",
  ],
]);

// Friendly display names for the persisted tile keys (keys kept stable for storage).
const tileLabels: Record<string, string> = {
  [NATIVE_MAP]: "Default",
  "OSM Default": "OpenStreetMap",
  "ERSI Satellite": "Satellite",
  Stadia: "Bright",
  Carto: "Light",
};

// Placeholder URL for the hidden UrlTile in native mode; must differ from every real
// tile URL so iOS rebuilds the overlay on switch (the .invalid TLD never collides).
const NATIVE_PLACEHOLDER_URL = "https://tile.invalid/{z}/{x}/{y}.png";

// Campus center & bounds (mirrors the web Leaflet configuration).
const CENTER: Region = {
  latitude: 28.6016,
  longitude: -81.2005,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};

// iOS zoom bounds as MapKit camera-to-center distances (meters); replaces the
// legacy minZoomLevel/maxZoomLevel props that froze the map at the limits.
const ZOOM_RANGE = {
  minCenterCoordinateDistance: 500,
  maxCenterCoordinateDistance: 4000,
  animated: false,
};

// Outer ring (large) with a campus-sized hole, to dim everything off-campus.
const OUTER_RING: LatLng[] = [
  { latitude: 28.64840202840334, longitude: -81.26488475758394 },
  { latitude: 28.52485540175175, longitude: -81.26488475758394 },
  { latitude: 28.52485540175175, longitude: -81.11457124982738 },
  { latitude: 28.64840202840334, longitude: -81.11457124982738 },
];
const CAMPUS_HOLE: LatLng[] = [
  { latitude: 28.59089, longitude: -81.20729 },
  { latitude: 28.61173, longitude: -81.20729 },
  { latitude: 28.61173, longitude: -81.18678 },
  { latitude: 28.59089, longitude: -81.18678 },
];
// Stable reference for the Polygon `holes` prop; an inline array re-tessellates the mask every render.
const CAMPUS_HOLES: LatLng[][] = [CAMPUS_HOLE];

// Axis-aligned bounds of the campus hole; the viewport is kept inside them.
const CAMPUS_BOUNDS = {
  minLat: CAMPUS_HOLE[0].latitude,
  maxLat: CAMPUS_HOLE[1].latitude,
  minLng: CAMPUS_HOLE[0].longitude,
  maxLng: CAMPUS_HOLE[2].longitude,
};

// Clamp a region's center so the viewport edges stay within CAMPUS_BOUNDS (centering
// an axis when too zoomed out to contain it). Returns null when no correction is needed.
function clampToCampus(region: Region, southMarginDeg = 0): Region | null {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  const spanLat = CAMPUS_BOUNDS.maxLat - CAMPUS_BOUNDS.minLat;
  const spanLng = CAMPUS_BOUNDS.maxLng - CAMPUS_BOUNDS.minLng;

  // Let the south edge drop `southMarginDeg` below campus (for the sheet); north stays pinned.
  const effMinLat = CAMPUS_BOUNDS.minLat - southMarginDeg;
  const lat =
    latitudeDelta >= spanLat + southMarginDeg
      ? (effMinLat + CAMPUS_BOUNDS.maxLat) / 2
      : Math.min(
          Math.max(latitude, effMinLat + latitudeDelta / 2),
          CAMPUS_BOUNDS.maxLat - latitudeDelta / 2,
        );

  const lng =
    longitudeDelta >= spanLng
      ? (CAMPUS_BOUNDS.minLng + CAMPUS_BOUNDS.maxLng) / 2
      : Math.min(
          Math.max(longitude, CAMPUS_BOUNDS.minLng + longitudeDelta / 2),
          CAMPUS_BOUNDS.maxLng - longitudeDelta / 2,
        );

  // Ignore sub-~2m differences so the correction can't loop.
  const EPS = 2e-5;
  if (Math.abs(lat - latitude) < EPS && Math.abs(lng - longitude) < EPS) {
    return null;
  }
  return { latitude: lat, longitude: lng, latitudeDelta, longitudeDelta };
}

// Region MapKit's native `cameraBoundary` (iOS) constrains the map center to: the
// campus hole shrunk by half the viewport, so the viewport edges stay inside it.
function computeBoundary(
  viewportLatDelta: number,
  viewportLngDelta: number,
  southMarginDeg = 0,
) {
  const spanLat = CAMPUS_BOUNDS.maxLat - CAMPUS_BOUNDS.minLat;
  const spanLng = CAMPUS_BOUNDS.maxLng - CAMPUS_BOUNDS.minLng;
  const TINY = 1e-4; // ~11m; keeps the region valid while effectively locking
  return {
    // Extend the allowed-center range `southMarginDeg` further south (for the sheet);
    // north/east/west stay pinned to the hole.
    latitude:
      (CAMPUS_BOUNDS.minLat + CAMPUS_BOUNDS.maxLat) / 2 - southMarginDeg / 2,
    longitude: (CAMPUS_BOUNDS.minLng + CAMPUS_BOUNDS.maxLng) / 2,
    latitudeDelta: Math.max(spanLat + southMarginDeg - viewportLatDelta, TINY),
    longitudeDelta: Math.max(spanLng - viewportLngDelta, TINY),
  };
}

// The device-location dot owns its own location subscription so a position update
// re-renders only this marker, not the whole map (which froze pan/zoom mid-gesture).
const CurrentLocationMarker: React.FC<{
  enabled: boolean;
  permissionGranted: boolean;
}> = ({ enabled, permissionGranted }) => {
  const [coord, setCoord] = useState<LatLng | null>(null);
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    if (!enabled || !permissionGranted) {
      setCoord(null);
      return;
    }

    let cancelled = false;
    let stop: (() => void) | undefined;

    watchPosition((pos) => {
      setCoord({ latitude: pos.lat, longitude: pos.lon });
      localStorage.setItem(
        "currentLocation",
        JSON.stringify([pos.lat, pos.lon]),
      );
    }).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [enabled, permissionGranted]);

  // Track view changes only briefly when the dot appears (to capture its bitmap),
  // then disable so the marker isn't re-rasterized every frame during pan/zoom.
  const visible = enabled && coord != null;
  useEffect(() => {
    if (!visible) return;
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 1500);
    return () => clearTimeout(id);
  }, [visible]);

  if (!visible || !coord) return null;

  return (
    <Marker
      coordinate={coord}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
    >
      <View style={styles.currentOuter}>
        <View style={styles.currentInner} />
      </View>
    </Marker>
  );
};

// Marker icon display size (25x41), matching the web app's rendering of the 50x82 PNGs.
const MARKER_WIDTH = 25;
const MARKER_HEIGHT = 41;

// Keep the selected-entrance pin stacked above standard stop pins, as the web app did.
const STOP_Z_INDEX = 1;
const SELECTED_Z_INDEX = 1000;

// A pin rendered from a sized child <Image> (the Marker `image` prop can't resize on iOS).
// View changes are tracked only until the icon bitmap is captured, then disabled.
const PinMarker: React.FC<{
  coordinate: LatLng;
  source: ImageSourcePropType;
  zIndex: number;
  children?: React.ReactNode;
}> = ({ coordinate, source, zIndex, children }) => {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setTracks(false), 800);
    return () => clearTimeout(id);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      // `anchor` positions the tip on Android; iOS uses `centerOffset` (shift up half
      // the icon height) since it ignores `anchor` for custom child-view markers.
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -MARKER_HEIGHT / 2 }}
      zIndex={zIndex}
      tracksViewChanges={tracks}
    >
      <Image
        source={source}
        style={styles.markerIcon}
        resizeMode="contain"
        onLoad={() => setTracks(false)}
      />
      {children}
    </Marker>
  );
};

const MapBox: React.FC<ChildProps> = ({
  stops,
  triggerRerender,
  toggleError,
  buildings,
  jaywalking,
  grass,
  parking,
  topInset,
  obscuredBottom,
  locationGranted,
}) => {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  // Most recent viewport zoom, so the south margin can be recomputed without a gesture.
  const lastDeltas = useRef({
    lat: CENTER.latitudeDelta,
    lng: CENTER.longitudeDelta,
  });

  // Convert the obscured bottom height (px) to a latitude span at a given zoom.
  const BOTTOM_DRAG_GAP = 10;
  function southMarginDeg(viewportLatDelta: number): number {
    const screenH = Dimensions.get("window").height;
    if (screenH <= 0) return 0;
    return ((obscuredBottom + BOTTOM_DRAG_GAP) / screenH) * viewportLatDelta;
  }

  const [selectedPoint, setSelectedPoint] = useState<LatLng | null>(null);
  const [paths, setPaths] = useState<number[][]>([]);
  const [loading, setLoading] = useState(false);
  const [tileModal, setTileModal] = useState(false);
  const [tileSelection, setTileSelection] = useState<string>(resolveInitialTile);

  // Native camera boundary (iOS) tracking the current zoom; seeded from the initial region.
  const [boundary, setBoundary] = useState(() =>
    computeBoundary(
      CENTER.latitudeDelta,
      CENTER.longitudeDelta,
      southMarginDeg(CENTER.latitudeDelta),
    ),
  );

  // Re-derive the boundary when the obscured-bottom height changes, using the last zoom.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const { lat, lng } = lastDeltas.current;
    setBoundary(computeBoundary(lat, lng, southMarginDeg(lat)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obscuredBottom]);

  // `shouldReplaceMapContent` applies on iOS only as a prop update, not at mount; mount
  // it off and flip it on after first commit so a cold-start custom tile replaces the base map.
  const [replaceApplied, setReplaceApplied] = useState(false);

  // Retrieve graph data (memoized; rebuilds only when options change).
  const data = useMemo(
    () => createGraph(buildings, jaywalking, grass, parking),
    [buildings, jaywalking, grass, parking],
  );
  const pointMap = data.pointMap;
  const settings: Settings = JSON.parse(localStorage.getItem("settings")!);

  // The device-location watch + dot live in <CurrentLocationMarker> (see above).

  // Deliver shouldReplaceMapContent as a post-mount prop update (see note above).
  useEffect(() => {
    setReplaceApplied(true);
  }, []);

  // Custom tile layers have no load event, so show the spinner briefly on a timer
  // when a non-native layer is selected (the native base map is instant).
  useEffect(() => {
    if (tileSelection === NATIVE_MAP) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(id);
  }, [tileSelection]);

  // Recompute the route whenever stops or map options change.
  useEffect(() => {
    handleDeselect();
    var totalDistance = 0;
    var tempPaths: number[][] = [];

    for (var i = 0; i < stops.length - 1; i++) {
      if (stops[i].selectedEntrance == -1) {
        console.error("Entrance " + i + " not set in path calculation.");
        toggleError(true);
        break;
      }

      var result = dijkstra(
        data.graph,
        stops[i].Entrances[stops[i].selectedEntrance - 1].id,
        stops[i + 1].Entrances[stops[i + 1].selectedEntrance - 1].id,
      );

      if (result.path.length == 0) toggleError(true);

      if (stops[i + 1].selectedEntrance == -1) {
        console.error("Entrance " + (i + 1) + " not set in path calculation.");
        toggleError(true);
        break;
      }

      const legDist = result.distances.get(
        stops[i + 1].Entrances[stops[i + 1].selectedEntrance - 1].id,
      );
      if (legDist != undefined) totalDistance += legDist;

      tempPaths.push(result.path);
    }

    localStorage.setItem(
      "graphData",
      JSON.stringify({
        distanceMi: totalDistance * 0.621371,
        distanceKm: totalDistance,
      }),
    );

    if (displayAllPaths) tempPaths = data.pathnum;

    setPaths(tempPaths);
    triggerRerender();
  }, [stops, buildings, jaywalking, grass, parking]);

  // Sync the selected entrance marker from localStorage (set by Search/Route).
  useEffect(() => {
    getSelected();
  });

  function getSelected() {
    var temp = localStorage.getItem("selectedPoint");
    var next: LatLng | null = null;

    if (temp != undefined && temp != null) {
      var parsedItem: Item = JSON.parse(temp);

      if (parsedItem.Entrances != undefined && parsedItem.Entrances != null) {
        const entrance =
          parsedItem.selectedEntrance == -1
            ? parsedItem.Entrances[0]
            : parsedItem.Entrances[parsedItem.selectedEntrance - 1];
        next = { latitude: entrance.lat, longitude: entrance.lon };
      }
    }

    if (
      (next === null && selectedPoint !== null) ||
      (next !== null &&
        (selectedPoint === null ||
          next.latitude !== selectedPoint.latitude ||
          next.longitude !== selectedPoint.longitude))
    ) {
      setSelectedPoint(next);
    }
  }

  // Pan to the selected entrance when it changes.
  useEffect(() => {
    if (selectedPoint && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: selectedPoint.latitude,
          longitude: selectedPoint.longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        },
        500,
      );
    }
  }, [selectedPoint]);

  function handleDeselect() {
    localStorage.setItem("selectedPoint", JSON.stringify([-1, -1]));
    setSelectedPoint(null);
  }

  function handleRegionChangeComplete(region: Region) {
    lastDeltas.current = {
      lat: region.latitudeDelta,
      lng: region.longitudeDelta,
    };
    const margin = southMarginDeg(region.latitudeDelta);

    if (Platform.OS === "ios") {
      // iOS is held in-bounds natively; recompute the zoom-dependent boundary from the
      // settled viewport, committing only when it changed so a pure pan doesn't re-render.
      const next = computeBoundary(
        region.latitudeDelta,
        region.longitudeDelta,
        margin,
      );
      setBoundary((prev) =>
        Math.abs(prev.latitude - next.latitude) < 1e-7 &&
        Math.abs(prev.latitudeDelta - next.latitudeDelta) < 1e-7 &&
        Math.abs(prev.longitudeDelta - next.longitudeDelta) < 1e-7
          ? prev
          : next,
      );
      return;
    }

    // Android has no native boundary, so snap the viewport back inside the campus bounds
    // after the gesture settles (the corrected region clamps to null and doesn't loop).
    const clamped = clampToCampus(region, margin);
    if (clamped && mapRef.current) {
      mapRef.current.animateToRegion(clamped, 180);
    }
  }

  function handleTileSelection(key: string) {
    localStorage.setItem("tile", key);
    setTileSelection(key);
  }

  function legCoords(path: number[]): LatLng[] {
    const coords: LatLng[] = [];
    path.forEach((node) => {
      const p = pointMap.get(node);
      if (p) coords.push({ latitude: p.lat, longitude: p.lon });
    });
    return coords;
  }

  // Precompute route legs/markers; memoized since they depend only on the route, not
  // the device location, so location updates don't rebuild every overlay (which stuttered).
  const legElements = useMemo(
    () =>
      paths.map((path, index) => (
        <Polyline
          key={"leg-" + index}
          coordinates={legCoords(path)}
          strokeColor="rgba(0,0,255,0.6)"
          strokeWidth={4}
        />
      )),
    [paths, pointMap],
  );

  const stopMarkers = useMemo(
    () =>
      stops.map((point, index) => {
        if (!point.Entrances) return null;
        const entrance = point.Entrances[point.selectedEntrance - 1];
        if (!entrance) return null;
        const label =
          index === 0
            ? "Start: " + point.name
            : index === stops.length - 1
              ? "End: " + point.name
              : "Stop " + (index + 1) + ": " + point.name;
        return (
          <PinMarker
            key={"stop-" + index}
            coordinate={{ latitude: entrance.lat, longitude: entrance.lon }}
            source={standardImage}
            zIndex={STOP_Z_INDEX}
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutText}>{label}</Text>
              </View>
            </Callout>
          </PinMarker>
        );
      }),
    [stops],
  );

  // Stable element for the off-campus dimming mask; memoized so it's never re-sent to native.
  const campusMask = useMemo(
    () => (
      <Polygon
        coordinates={OUTER_RING}
        holes={CAMPUS_HOLES}
        strokeColor="#ffca09"
        strokeWidth={2}
        fillColor="rgba(0,0,0,0.4)"
      />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={CENTER}
        // Zoom bounds: iOS uses native cameraZoomRange + cameraBoundary (via local patch),
        // since the legacy min/maxZoomLevel props freeze the map at limits; Android keeps them.
        {...(Platform.OS === "ios"
          ? ({ cameraZoomRange: ZOOM_RANGE, cameraBoundary: boundary } as object)
          : { minZoomLevel: 15, maxZoomLevel: 18 })}
        rotateEnabled={false}
        pitchEnabled={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        // Android can't replace the base map, so hide it (mapType "none"); iOS uses shouldReplaceMapContent.
        mapType={
          Platform.OS === "android" && tileSelection !== NATIVE_MAP
            ? "none"
            : "standard"
        }
        onMapReady={() => setLoading(false)}
      >
        {/* Kept permanently mounted so a layer switch is a prop update, not a fresh mount */}
        <UrlTile
          urlTemplate={
            tileSelection === NATIVE_MAP
              ? NATIVE_PLACEHOLDER_URL
              : tileSelectionOptions.get(tileSelection)!
          }
          maximumZ={19}
          // In native mode a minimumZ above the max zoom makes the mounted overlay inert,
          // so MapKit requests no tiles (the invisible overlay otherwise froze pinch-zoom).
          minimumZ={tileSelection === NATIVE_MAP ? 22 : 0}
          flipY={false}
          shouldReplaceMapContent={replaceApplied && tileSelection !== NATIVE_MAP}
          opacity={tileSelection === NATIVE_MAP ? 0 : 1}
          // Also keep it off the network in native mode, where it should never draw.
          offlineMode={tileSelection === NATIVE_MAP}
        />

        {/* Computed route legs */}
        {legElements}

        {/* Stop markers */}
        {stopMarkers}

        {/* Selected entrance marker — kept above stop pins via JSX order and zIndex */}
        {selectedPoint && (
          <PinMarker
            coordinate={selectedPoint}
            source={selectImage}
            zIndex={SELECTED_Z_INDEX}
          />
        )}

        {/* Current location (owns its location watch to avoid re-rendering the map) */}
        <CurrentLocationMarker
          enabled={settings.showLocation}
          permissionGranted={locationGranted}
        />

        {/* Off-campus dimming mask */}
        {campusMask}
      </MapView>

      {/* Floating map controls (left column, beneath the brand pill) */}
      <View
        pointerEvents="box-none"
        style={[styles.controls, { top: topInset + 60 }]}
      >
        <TouchableOpacity
          style={[
            styles.controlButton,
            { backgroundColor: theme.controlBg, borderColor: theme.controlBorder },
          ]}
          onPress={() => setTileModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Map style"
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="layers-outline"
            size={22}
            color={theme.text}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            { backgroundColor: theme.controlBg, borderColor: theme.controlBorder },
            !selectedPoint && styles.controlDisabled,
          ]}
          onPress={handleDeselect}
          disabled={!selectedPoint}
          accessibilityRole="button"
          accessibilityLabel="Clear selected location"
          activeOpacity={0.7}
        >
          <Image source={deselectImage} style={styles.deselectIcon} />
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator
          style={[styles.mapLoader, { top: topInset + 66 }]}
          color={theme.primary}
          size="small"
        />
      )}

      {/* Map style modal */}
      <Modal
        visible={tileModal}
        transparent
        animationType="fade"
        onRequestClose={() => setTileModal(false)}
      >
        <Pressable
          style={styles.tileBackdrop}
          onPress={() => setTileModal(false)}
        >
          <Pressable
            style={[
              styles.tileCard,
              { backgroundColor: theme.cardBg, borderColor: theme.controlBorder },
            ]}
          >
            <Text style={[styles.tileTitle, { color: theme.secondaryText }]}>
              Map Style
            </Text>
            {[...tileSelectionOptions.keys()].map((key, i) => {
              const active = tileSelection === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.tileOption,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.separator,
                    },
                  ]}
                  onPress={() => {
                    handleTileSelection(key);
                    setTileModal(false);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.tileOptionText, { color: theme.text }]}>
                    {tileLabels[key] ?? key}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  android: { elevation: 4 },
  default: {},
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  currentOuter: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 5,
    shadowOffset: { width: 2, height: 2 },
    elevation: 4,
  },
  currentInner: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: "#1975c8",
  },
  markerIcon: {
    width: MARKER_WIDTH,
    height: MARKER_HEIGHT,
  },
  callout: {
    width: 150,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  calloutText: {
    fontSize: 14,
    textAlign: "center",
    flexWrap: "wrap",
  },
  controls: {
    position: "absolute",
    left: 14,
    gap: 10,
  },
  controlButton: {
    height: 42,
    width: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW,
  },
  controlDisabled: {
    opacity: 0.4,
  },
  deselectIcon: {
    height: 24,
    width: 16,
    resizeMode: "contain",
  },
  mapLoader: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tileBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  tileCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    overflow: "hidden",
    ...SHADOW,
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
  },
  tileOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  tileOptionText: {
    fontSize: 16,
    fontWeight: "500",
  },
});

export default MapBox;
