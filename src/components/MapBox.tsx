import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
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
import { getCurrentPosition } from "../location";
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

// The native iOS base map (Apple Maps). Selecting this renders no UrlTile
// overlay, so the underlying PROVIDER_DEFAULT map shows through.
const APPLE_MAPS = "Apple Maps";

// Resolve the initially selected tile. Older builds defaulted to (and
// persisted) "OSM Default"; a one-time migration moves those installs onto the
// new Apple Maps default so it actually takes effect. User choices made after
// the migration are preserved.
const TILE_DEFAULT_VERSION = "appleMaps-v1";
function resolveInitialTile(): string {
  if (localStorage.getItem("tileDefaultVersion") !== TILE_DEFAULT_VERSION) {
    localStorage.setItem("tileDefaultVersion", TILE_DEFAULT_VERSION);
    localStorage.setItem("tile", APPLE_MAPS);
    return APPLE_MAPS;
  }
  return localStorage.getItem("tile") ?? APPLE_MAPS;
}

const tileSelectionOptions = new Map<string, string>([
  [APPLE_MAPS, ""],
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

// Campus center & bounds (mirrors the web Leaflet configuration).
const CENTER: Region = {
  latitude: 28.6016,
  longitude: -81.2005,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
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

const MapBox: React.FC<ChildProps> = ({
  stops,
  triggerRerender,
  toggleError,
}) => {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  var initVals = [true, false, false, false];
  var initData = localStorage.getItem("mapOptions");
  if (initData != undefined) initVals = JSON.parse(initData);

  const [buildings, setBuilding] = useState(initVals[0]);
  const [jaywalking, setJaywalking] = useState(initVals[1]);
  const [grass, setGrass] = useState(initVals[2]);
  const [parking, setParking] = useState(initVals[3]);
  const [selectedPoint, setSelectedPoint] = useState<LatLng | null>(null);
  const [paths, setPaths] = useState<number[][]>([]);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);
  const [tileModal, setTileModal] = useState(false);
  const [tileSelection, setTileSelection] = useState<string>(resolveInitialTile);

  // Retrieve graph data (memoized; rebuilds only when options change).
  const data = useMemo(
    () => createGraph(buildings, jaywalking, grass, parking),
    [buildings, jaywalking, grass, parking],
  );
  const pointMap = data.pointMap;
  const graphData: GraphData = JSON.parse(localStorage.getItem("graphData")!);
  const settings: Settings = JSON.parse(localStorage.getItem("settings")!);

  async function currentLocationHandler() {
    const currentSettings: Settings = JSON.parse(
      localStorage.getItem("settings")!,
    );

    if (currentSettings.showLocation === false) {
      if (currentLocation !== null) setCurrentLocation(null);
      return;
    }

    const pos = await getCurrentPosition();
    if (!pos) return;

    if (
      currentLocation &&
      currentLocation.latitude === pos.lat &&
      currentLocation.longitude === pos.lon
    )
      return;

    setCurrentLocation({ latitude: pos.lat, longitude: pos.lon });
    localStorage.setItem("currentLocation", JSON.stringify([pos.lat, pos.lon]));
  }

  useEffect(() => {
    currentLocationHandler();
    const interval = setInterval(currentLocationHandler, 2000);
    return () => clearInterval(interval);
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
          minZoomLevel={15}
          maxZoomLevel={18}
          rotateEnabled={false}
          pitchEnabled={false}
          onMapReady={() => setLoading(false)}
        >
          {tileSelection !== APPLE_MAPS && (
            <UrlTile
              urlTemplate={tileSelectionOptions.get(tileSelection)!}
              maximumZ={19}
              flipY={false}
            />
          )}

          {/* Computed route legs */}
          {paths.map((path, index) => (
            <Polyline
              key={"leg-" + index}
              coordinates={legCoords(path)}
              strokeColor="rgba(0,0,255,0.6)"
              strokeWidth={4}
            />
          ))}

          {/* Stop markers */}
          {stops.map((point, index) => {
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
              >
                <Callout>
                  <Text>{label}</Text>
                </Callout>
              </Marker>
            );
          })}

          {/* Selected entrance marker */}
          {selectedPoint && (
            <Marker
              coordinate={selectedPoint}
              image={selectImage}
              anchor={{ x: 0.5, y: 1 }}
            />
          )}

          {/* Current location */}
          {currentLocation && settings.showLocation && (
            <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.currentOuter}>
                <View style={styles.currentInner} />
              </View>
            </Marker>
          )}

          {/* Off-campus dimming mask */}
          <Polygon
            coordinates={OUTER_RING}
            holes={[CAMPUS_HOLE]}
            strokeColor="#ffca09"
            strokeWidth={2}
            fillColor="rgba(0,0,0,0.4)"
          />
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
                  if (key !== APPLE_MAPS) setLoading(true);
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
