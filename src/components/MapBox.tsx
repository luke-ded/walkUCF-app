import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  // Route-affecting options now live in HomePage (surfaced in the bottom
  // sheet) and are passed down so the graph/route stay in sync.
  buildings: boolean;
  jaywalking: boolean;
  grass: boolean;
  parking: boolean;
  // Safe-area top inset so the floating map controls clear the status bar.
  topInset: number;
}

const displayAllPaths = false; // Change to true to view all paths

// The platform's native base map (Apple Maps on iOS, Google Maps on Android).
// When selected the UrlTile is kept mounted but hidden (opacity 0) so the
// underlying PROVIDER_DEFAULT map shows through.
const NATIVE_MAP = "Native";

// Resolve the initially selected tile. Older builds defaulted to (and
// persisted) "OSM Default"; a one-time migration moves those installs onto the
// new native-map default so it actually takes effect. User choices made after
// the migration are preserved.
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

// Friendly display names for the persisted tile keys above (keys are kept
// stable for storage compatibility).
const tileLabels: Record<string, string> = {
  [NATIVE_MAP]: "Default",
  "OSM Default": "OpenStreetMap",
  "ERSI Satellite": "Satellite",
  Stadia: "Bright",
  Carto: "Light",
};

// Placeholder template that keeps the (hidden) UrlTile mounted while the native
// base map is selected; it never becomes visible (opacity 0) or fetched
// (offlineMode + a minimumZ above the max zoom). It MUST differ from every real
// tile URL above: on iOS react-native-maps only rebuilds the MKTileOverlay —
// and therefore only loads tiles — when `urlTemplate` actually changes. If the
// placeholder equalled a real URL (it used to be "OSM Default"), switching from
// the native map to that layer left `urlTemplate` unchanged, so no overlay was
// rebuilt and the tiles didn't appear until the next pan/zoom. The reserved
// `.invalid` TLD guarantees this never collides with a real source (and it is
// never actually requested anyway).
const NATIVE_PLACEHOLDER_URL = "https://tile.invalid/{z}/{x}/{y}.png";

// Campus center & bounds (mirrors the web Leaflet configuration).
const CENTER: Region = {
  latitude: 28.6016,
  longitude: -81.2005,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};

// iOS zoom bounds, expressed as MapKit camera-to-center distances in meters
// (the native MKMapView.cameraZoomRange). `minCenterCoordinateDistance` is the
// closest the camera may get (most zoomed in, ~building level);
// `maxCenterCoordinateDistance` is the farthest (most zoomed out, ~whole
// campus). These replace the legacy minZoomLevel/maxZoomLevel props on iOS,
// which froze the map at the limits (see the MapView usage below). Tune these
// two numbers to taste — they are approximate equivalents of the old 18/15.
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
// Stable reference for the Polygon `holes` prop. Building `[CAMPUS_HOLE]`
// inline rebuilds the array every render, which makes react-native-maps
// re-tessellate this large masking polygon on each location update — a major
// source of stutter while panning/zooming.
const CAMPUS_HOLES: LatLng[][] = [CAMPUS_HOLE];

// Axis-aligned bounds of the un-dimmed campus hole. The map's viewport is kept
// inside these so the user can't pan off-campus into the dimmed region.
const CAMPUS_BOUNDS = {
  minLat: CAMPUS_HOLE[0].latitude,
  maxLat: CAMPUS_HOLE[1].latitude,
  minLng: CAMPUS_HOLE[0].longitude,
  maxLng: CAMPUS_HOLE[2].longitude,
};

// Clamp a region's center so the *viewport edges* stay within CAMPUS_BOUNDS
// (not just the center) — so off-campus area is never even visible. When a
// span is larger than the bounds (zoomed so far out the hole can't fill the
// screen) that axis is centered instead, since containment is impossible.
// Returns null when the region is already inside, so no correction is needed.
function clampToCampus(region: Region): Region | null {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  const spanLat = CAMPUS_BOUNDS.maxLat - CAMPUS_BOUNDS.minLat;
  const spanLng = CAMPUS_BOUNDS.maxLng - CAMPUS_BOUNDS.minLng;

  const lat =
    latitudeDelta >= spanLat
      ? (CAMPUS_BOUNDS.minLat + CAMPUS_BOUNDS.maxLat) / 2
      : Math.min(
          Math.max(latitude, CAMPUS_BOUNDS.minLat + latitudeDelta / 2),
          CAMPUS_BOUNDS.maxLat - latitudeDelta / 2,
        );

  const lng =
    longitudeDelta >= spanLng
      ? (CAMPUS_BOUNDS.minLng + CAMPUS_BOUNDS.maxLng) / 2
      : Math.min(
          Math.max(longitude, CAMPUS_BOUNDS.minLng + longitudeDelta / 2),
          CAMPUS_BOUNDS.maxLng - longitudeDelta / 2,
        );

  // Ignore sub-~2m differences so the programmatic correction can't loop (a
  // re-applied animateToRegion reports a near-identical region back).
  const EPS = 2e-5;
  if (Math.abs(lat - latitude) < EPS && Math.abs(lng - longitude) < EPS) {
    return null;
  }
  return { latitude: lat, longitude: lng, latitudeDelta, longitudeDelta };
}

// The device-location dot lives in its own component, with its own location
// subscription and state, so a position update re-renders only this marker —
// not the whole map. Previously `currentLocation` lived in MapBox, so every
// GPS fix (which can fire several times a second with distanceInterval:1 and
// GPS jitter) re-rendered the entire MapView subtree; those re-renders
// reconciling mid-gesture were the cause of the periodic pan/zoom freezes.
const CurrentLocationMarker: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const [coord, setCoord] = useState<LatLng | null>(null);
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    if (!enabled) {
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
  }, [enabled]);

  // Track view changes only briefly when the dot first appears so its bitmap is
  // captured, then disable tracking; otherwise react-native-maps re-rasterizes
  // the (shadowed, multi-view) marker every frame during pan/zoom. Position
  // updates afterwards move the marker via its coordinate prop without tracking.
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

// Marker icon display size. The source PNGs are 50x82; the original web app
// drew them at height 41 / width auto (= 25x41) and anchored them at the
// bottom-center tip (Leaflet iconAnchor [12, 41]).
const MARKER_WIDTH = 25;
const MARKER_HEIGHT = 41;

// The web app kept the gold "selected entrance" pin stacked above every
// standard stop pin (Leaflet zIndexOffset). Mirror that here so a selected
// entrance that coincides with a stop is never hidden behind it.
const STOP_Z_INDEX = 1;
const SELECTED_Z_INDEX = 1000;

// A pin rendered from a sized child <Image> rather than the Marker `image`
// prop. react-native-maps cannot resize the `image` prop, so on iOS a 50x82
// asset draws at ~50x82pt (roughly double the intended size); a child image
// lets us pin the exact 25x41 the web app used. View changes are tracked only
// until the icon bitmap is captured (onLoad, with an 800ms fallback), then
// disabled so the marker isn't re-rasterized every frame while panning/zooming.
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
      // `anchor` (fractional) positions the bottom-center tip on Android. iOS
      // ignores `anchor` for custom child-view markers and instead positions
      // by `centerOffset` (in points): the view is centered on the coordinate
      // by default, so shift it up by half the icon height to put the tip on
      // the point. This restores the offset the `image` prop used to apply.
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
}) => {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  const [selectedPoint, setSelectedPoint] = useState<LatLng | null>(null);
  const [paths, setPaths] = useState<number[][]>([]);
  const [loading, setLoading] = useState(false);
  const [tileModal, setTileModal] = useState(false);
  const [tileSelection, setTileSelection] = useState<string>(resolveInitialTile);

  // react-native-maps applies a UrlTile's `shouldReplaceMapContent`
  // (MKTileOverlay.canReplaceMapContent on iOS) only when it arrives as a prop
  // *update*, not at the value it is first mounted with. On a cold start where a
  // custom tile set is the persisted selection, the tile mounts with the flag
  // already true, so it is never applied: MapKit keeps drawing the Apple base
  // map, leaking its labels *and* its "Legal" attribution link through the
  // custom tiles. We mount with the flag off and flip it on after the first
  // commit, so canReplaceMapContent is always delivered as an update — the same
  // path that already makes in-session tile switches work.
  const [replaceApplied, setReplaceApplied] = useState(false);

  // Retrieve graph data (memoized; rebuilds only when options change).
  const data = useMemo(
    () => createGraph(buildings, jaywalking, grass, parking),
    [buildings, jaywalking, grass, parking],
  );
  const pointMap = data.pointMap;
  const settings: Settings = JSON.parse(localStorage.getItem("settings")!);

  // The device-location watch + dot now live in <CurrentLocationMarker> so its
  // frequent position updates don't re-render this whole component.

  // Deliver shouldReplaceMapContent as a post-mount prop update (see the
  // replaceApplied note above). Runs once after the first commit; thereafter the
  // flag tracks tileSelection normally.
  useEffect(() => {
    setReplaceApplied(true);
  }, []);

  // Custom tile layers expose no "finished loading" event, so the spinner is
  // shown briefly whenever a non-native layer is selected and then cleared on a
  // timer. (The native base map is instant and never shows it.) Previously the
  // spinner was only cleared by the one-shot onMapReady, so it stayed up
  // forever after the first tile switch.
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

  // After a pan/zoom settles, snap back inside the campus bounds if the
  // gesture pushed the viewport past them. The corrected region is in-bounds,
  // so its own settle event clamps to null and the correction doesn't loop.
  function handleRegionChangeComplete(region: Region) {
    const clamped = clampToCampus(region);
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

  // Precompute the route legs and stop markers. These depend only on the
  // route/options, not on the device location, so memoizing them keeps the
  // frequent location-update re-renders from rebuilding (and re-sending to
  // native) every overlay — which otherwise stutters panning and zooming.
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
              <Text>{label}</Text>
            </Callout>
          </PinMarker>
        );
      }),
    [stops],
  );

  // Stable element for the large off-campus dimming mask. Memoizing it (props
  // are all module constants) means a location-update re-render never re-sends
  // this polygon to native, avoiding any chance of re-tessellation.
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
        // Zoom bounds. On iOS the legacy minZoomLevel/maxZoomLevel props
        // (deprecated for Apple Maps) enforce limits by re-setting the camera
        // with animated:TRUE from JS on every region change once you pinch
        // past a limit; that reset fights the live gesture and freezes the map
        // — worst on older devices (react-native-maps #4961). MapKit's native
        // cameraZoomRange clamps with no JS feedback loop. Android keeps the
        // legacy props (backed by a non-freezing native implementation).
        {...(Platform.OS === "ios"
          ? { cameraZoomRange: ZOOM_RANGE }
          : { minZoomLevel: 15, maxZoomLevel: 18 })}
        rotateEnabled={false}
        pitchEnabled={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        // On Android the custom tiles can't replace the base map, so hide it
        // (mapType "none") to stop the native map's labels showing through.
        // On iOS the base map stays and UrlTile's shouldReplaceMapContent
        // handles this instead.
        mapType={
          Platform.OS === "android" && tileSelection !== NATIVE_MAP
            ? "none"
            : "standard"
        }
        onMapReady={() => setLoading(false)}
      >
        {/* Kept permanently mounted (even for the native base map, where
            it's hidden via opacity) so switching options is always a prop
            update, never a fresh mount. A fresh UrlTile mount fails to apply
            canReplaceMapContent on iOS, leaving the native labels visible. */}
        <UrlTile
          urlTemplate={
            tileSelection === NATIVE_MAP
              ? NATIVE_PLACEHOLDER_URL
              : tileSelectionOptions.get(tileSelection)!
          }
          maximumZ={19}
          // In native-map mode the overlay stays mounted (so switching to a
          // custom tile set is a prop update, not a remount — see note above)
          // but is made inert: a minimumZ above the map's max zoom (18) means
          // MapKit requests no tiles, so its MKTileOverlayRenderer does no
          // per-zoom rasterization over the live Apple base map. Without this
          // the invisible (opacity 0) overlay still composites on every zoom
          // step, which froze the Apple base map during pinch-zoom.
          minimumZ={tileSelection === NATIVE_MAP ? 22 : 0}
          flipY={false}
          shouldReplaceMapContent={replaceApplied && tileSelection !== NATIVE_MAP}
          opacity={tileSelection === NATIVE_MAP ? 0 : 1}
          // Belt-and-suspenders: also keep it off the network in native mode
          // (the nw_connection log churn) since it should never draw there.
          offlineMode={tileSelection === NATIVE_MAP}
        />

        {/* Computed route legs */}
        {legElements}

        {/* Stop markers */}
        {stopMarkers}

        {/* Selected entrance marker — kept above the standard stop pins via
            both JSX order (rendered last) and an elevated zIndex. */}
        {selectedPoint && (
          <PinMarker
            coordinate={selectedPoint}
            source={selectImage}
            zIndex={SELECTED_Z_INDEX}
          />
        )}

        {/* Current location (self-contained: owns its location watch so
            position updates don't re-render the rest of the map) */}
        <CurrentLocationMarker enabled={settings.showLocation} />

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
