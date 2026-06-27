import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { palette, useTheme } from "../theme";
import { GraphData, Item, Settings } from "../types";
import selectImage from "../assets/gold-select-marker-icon.png";
import standardImage from "../assets/standard-marker-icon.png";
import deselectImage from "../assets/gold-deselect-marker-icon.png";

interface ChildProps {
  triggerRerender: () => void;
  toggleError: (error: boolean) => void;
  stops: Item[];
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

// A valid template to keep the (hidden) UrlTile mounted while the native base
// map is selected; it never becomes visible because opacity is 0.
const NATIVE_PLACEHOLDER_URL = tileSelectionOptions.get("OSM Default")!;

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
  maxCenterCoordinateDistance: 3000,
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

// Parse the persisted map-option toggles. Used only to seed initial state, so
// it must not run in the render body (which re-runs on every location update).
function loadMapOptions(): boolean[] {
  const data = localStorage.getItem("mapOptions");
  if (data != null) {
    try {
      return JSON.parse(data);
    } catch {
      // fall through to defaults on malformed data
    }
  }
  return [true, false, false, false];
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

const MapBox: React.FC<ChildProps> = ({
  stops,
  triggerRerender,
  toggleError,
}) => {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  // Parse once at mount (not on every render); only seeds the toggle state.
  const initVals = useMemo(loadMapOptions, []);

  const [buildings, setBuilding] = useState(initVals[0]);
  const [jaywalking, setJaywalking] = useState(initVals[1]);
  const [grass, setGrass] = useState(initVals[2]);
  const [parking, setParking] = useState(initVals[3]);
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
  const graphData: GraphData = JSON.parse(localStorage.getItem("graphData")!);
  const settings: Settings = JSON.parse(localStorage.getItem("settings")!);

  // The device-location watch + dot now live in <CurrentLocationMarker> so its
  // frequent position updates don't re-render this whole component.

  // Deliver shouldReplaceMapContent as a post-mount prop update (see the
  // replaceApplied note above). Runs once after the first commit; thereafter the
  // flag tracks tileSelection normally.
  useEffect(() => {
    setReplaceApplied(true);
  }, []);

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

    localStorage.setItem(
      "mapOptions",
      JSON.stringify([buildings, jaywalking, grass, parking]),
    );

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

  function handleTileSelection(key: string) {
    localStorage.setItem("tile", key);
    setTileSelection(key);
  }

  const walkMinutes =
    settings.walkSpeed != 0 &&
    graphData.distanceMi != null &&
    settings.walkSpeed != null
      ? (
          Number(graphData.distanceMi.toFixed(2)) /
          (settings.walkSpeed / 60)
        ).toFixed(1)
      : "0";

  const distanceLabel =
    settings.units == "imperial"
      ? graphData.distanceMi.toFixed(2) + " mi"
      : graphData.distanceKm.toFixed(2) + " km";

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
          <Marker
            key={"stop-" + index}
            coordinate={{ latitude: entrance.lat, longitude: entrance.lon }}
            image={standardImage}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <Callout>
              <Text>{label}</Text>
            </Callout>
          </Marker>
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

  const optionButtons: { label: string; on: boolean; toggle: () => void }[] = [
    { label: "Buildings", on: buildings, toggle: () => setBuilding(!buildings) },
    {
      label: "Jaywalking",
      on: jaywalking,
      toggle: () => setJaywalking(!jaywalking),
    },
    {
      label: "Parking Lots",
      on: parking,
      toggle: () => setParking(!parking),
    },
    { label: "Grass", on: grass, toggle: () => setGrass(!grass) },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.mapWrap, { borderColor: theme.primary }]}>
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

          {/* Selected entrance marker */}
          {selectedPoint && (
            <Marker
              coordinate={selectedPoint}
              image={selectImage}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            />
          )}

          {/* Current location (self-contained: owns its location watch so
              position updates don't re-render the rest of the map) */}
          <CurrentLocationMarker enabled={settings.showLocation} />

          {/* Off-campus dimming mask */}
          {campusMask}
        </MapView>

        {/* Tile selector button */}
        <TouchableOpacity
          style={styles.stackButton}
          onPress={() => setTileModal(true)}
        >
          <MaterialCommunityIcons name="layers" size={20} color="#000" />
        </TouchableOpacity>

        {/* Deselect button */}
        <TouchableOpacity
          style={[
            styles.deselectButton,
            { opacity: selectedPoint ? 1 : 0.5 },
          ]}
          onPress={handleDeselect}
          disabled={!selectedPoint}
        >
          <Image source={deselectImage} style={styles.deselectIcon} />
        </TouchableOpacity>

        {loading && (
          <ActivityIndicator
            style={styles.mapLoader}
            color="#ffffff"
            size="small"
          />
        )}

        {/* Distance / time overlay */}
        <View style={[styles.statOverlay, { borderColor: theme.primary }]}>
          <Text style={styles.statText}>
            {walkMinutes} min <Text style={styles.statBold}>|</Text>{" "}
            {distanceLabel}
          </Text>
        </View>
      </View>

      {/* Map option toggles */}
      <View style={[styles.optionsRow, { borderColor: theme.primary }]}>
        {optionButtons.map((opt) => (
          <TouchableOpacity
            key={opt.label}
            onPress={opt.toggle}
            style={[
              styles.optionButton,
              { borderColor: theme.primary },
              opt.on
                ? { backgroundColor: "rgba(255,202,9,0.5)" }
                : { backgroundColor: theme.primary },
            ]}
          >
            <Text
              style={[
                styles.optionText,
                { color: opt.on ? theme.text : palette.textDark },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tile selection modal */}
      <Modal visible={tileModal} transparent animationType="fade">
        <Pressable
          style={styles.tileBackdrop}
          onPress={() => setTileModal(false)}
        >
          <View style={[styles.tileMenu, { borderColor: theme.primary }]}>
            {[...tileSelectionOptions.keys()].map((key) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.tileOption,
                  { borderColor: theme.primary },
                  tileSelection === key
                    ? { backgroundColor: "rgba(255,202,9,0.5)" }
                    : { backgroundColor: theme.primary },
                ]}
                onPress={() => {
                  handleTileSelection(key);
                  setTileModal(false);
                  if (key !== NATIVE_MAP) setLoading(true);
                }}
              >
                <Text style={{ color: palette.textLight, fontWeight: "600" }}>
                  {key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapWrap: {
    flex: 1,
    margin: 8,
    borderRadius: 6,
    borderWidth: 2,
    overflow: "hidden",
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
  stackButton: {
    position: "absolute",
    top: 12,
    left: 12,
    height: 33,
    width: 33,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  deselectButton: {
    position: "absolute",
    top: 52,
    left: 12,
    height: 33,
    width: 33,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  deselectIcon: {
    height: 26,
    width: 17,
    resizeMode: "contain",
  },
  mapLoader: {
    position: "absolute",
    bottom: 6,
    left: 8,
  },
  statOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  statBold: {
    fontWeight: "700",
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 4,
    gap: 6,
  },
  optionButton: {
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  optionText: {
    fontWeight: "700",
    fontSize: 13,
  },
  tileBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileMenu: {
    width: 200,
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 8,
    gap: 8,
  },
  tileOption: {
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
});

export default MapBox;
