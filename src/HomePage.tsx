import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NavBar from "./components/NavBar";
import MapBox from "./components/MapBox";
import Search from "./components/Search";
import RouteList, { RouteOptionKey } from "./components/RouteList";
import BottomSheet, { BottomSheetRef } from "./components/BottomSheet";
import About from "./components/About";
import ErrorModal from "./components/Error";
import Settings from "./components/Settings";
import { localStorage } from "./storage";
import { requestLocationPermission, checkLocationPermission } from "./location";
import { useTheme } from "./theme";
import { GraphData, Item, Settings as SettingsType } from "./types";

type RouteOptions = Record<RouteOptionKey, boolean>;

// Seed the route options from the persisted `mapOptions` array. The legacy
// (and on-disk) order is [buildings, jaywalking, grass, parking].
function loadRouteOptions(): RouteOptions {
  const data = localStorage.getItem("mapOptions");
  if (data != null) {
    try {
      const arr = JSON.parse(data);
      if (Array.isArray(arr)) {
        return {
          buildings: !!arr[0],
          jaywalking: !!arr[1],
          grass: !!arr[2],
          parking: !!arr[3],
        };
      }
    } catch {
      // fall through to defaults on malformed data
    }
  }
  return { buildings: true, jaywalking: false, grass: false, parking: false };
}

// Route summary (walk time + distance) shown under the search bar when a route
// exists and the user isn't actively searching. Returned as parts so each value
// can be emphasized in the header — this is the app's primary output.
type RouteSummary = { minutes: string | null; distance: string };
function routeSummary(): RouteSummary | null {
  try {
    const graph = JSON.parse(localStorage.getItem("graphData")!) as GraphData;
    const settings = JSON.parse(localStorage.getItem("settings")!) as SettingsType;
    if (!graph || (graph.distanceMi === 0 && graph.distanceKm === 0)) return null;
    const distance =
      settings.units === "imperial"
        ? graph.distanceMi.toFixed(2) + " mi"
        : graph.distanceKm.toFixed(2) + " km";
    const minutes =
      settings.walkSpeed > 0
        ? Math.max(
            1,
            Math.round(graph.distanceMi / (settings.walkSpeed / 60)),
          ).toString()
        : null;
    return { minutes, distance };
  } catch {
    return null;
  }
}

function HomePage() {
  const theme = useTheme();
  const [count, setCount] = useState(0);
  const [about, toggleAbout] = useState(false);
  const [error, toggleError] = useState(false);
  const [settings, toggleSettings] = useState(false);
  const [stops, setStops] = useState<Item[]>([]);

  // Whether foreground location permission is granted.
  const [locationGranted, setLocationGranted] = useState<boolean>(() => {
    const stored = localStorage.getItem("permissionStatus");
    return stored != null ? JSON.parse(stored) === true : false;
  });

  // Search state lives here so the search bar (sheet header) and the body
  // (results vs. route) stay in sync, Apple-Maps style.
  const [searchTerm, setSearchTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const searchActive = focused || searchTerm.length > 0;

  // Route-affecting options, lifted out of MapBox so they can be toggled from
  // the bottom sheet while still feeding the map's pathfinding graph.
  const [options, setOptions] = useState<RouteOptions>(loadRouteOptions);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [insets, setInsets] = useState({
    top: Platform.OS === "android" ? StatusBar.currentHeight ?? 24 : 47,
    bottom: Platform.OS === "ios" ? 20 : 0,
  });
  // How much of the map the minimized sheet covers, so the map can be dragged
  // far enough to reveal the campus bottom above it.
  const [peekHeight, setPeekHeight] = useState(0);

  const sheetRef = useRef<BottomSheetRef>(null);

  var settingsData = localStorage.getItem("settings");
  if (settingsData == null || settingsData == undefined) {
    localStorage.setItem(
      "settings",
      JSON.stringify({
        units: "imperial",
        walkSpeed: 3,
        saveRoute: true,
        showLocation: true,
      }),
    );
  }

  var distanceData = localStorage.getItem("graphData");
  if (distanceData == null || distanceData == undefined) {
    localStorage.setItem(
      "graphData",
      JSON.stringify({ distanceMi: 0, distanceKm: 0 }),
    );
  }

  const triggerRerender = () => {
    setCount(count + 1);
  };

  // Persist the route options whenever they change (was previously written
  // from inside MapBox's route-computation effect).
  useEffect(() => {
    localStorage.setItem(
      "mapOptions",
      JSON.stringify([
        options.buildings,
        options.jaywalking,
        options.grass,
        options.parking,
      ]),
    );
  }, [options]);

  function onToggleOption(key: RouteOptionKey) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function checkGeolocationPermission() {
    try {
      const granted = await requestLocationPermission();
      localStorage.setItem("permissionStatus", JSON.stringify(granted));
      setLocationGranted(granted);
    } catch (error) {
      console.error("Error querying permissions:", error);
    }
  }

  useEffect(() => {
    const alreadyChecked = localStorage.getItem("permissionChecked");
    if (!alreadyChecked) {
      checkGeolocationPermission();
      localStorage.setItem("permissionChecked", "true");
    } else {
      // Re-sync on warm launches in case permission changed in system settings.
      checkLocationPermission().then(setLocationGranted);
    }
  }, []);

  // Track the keyboard so the results list can keep its last rows reachable.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function onMeasureInsets(e: LayoutChangeEvent) {
    const { y, height } = e.nativeEvent.layout;
    const winH = Dimensions.get("window").height;
    setInsets({
      top: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : y,
      bottom: Math.max(winH - y - height, 0),
    });
  }

  function enterSearch() {
    setFocused(true);
    sheetRef.current?.expand();
  }

  function exitSearch() {
    setSearchTerm("");
    setFocused(false);
    Keyboard.dismiss();
    sheetRef.current?.half();
  }

  // After a stop is added, return to the route so the change is visible.
  function onStopAdded() {
    setSearchTerm("");
    setFocused(false);
    Keyboard.dismiss();
    sheetRef.current?.half();
  }

  const summary = !searchActive && stops.length > 0 ? routeSummary() : null;

  const sheetHeader = (
    <View style={styles.headerWrap}>
      <View style={styles.searchRow}>
        <View style={[styles.searchField, { backgroundColor: theme.searchFieldBg }]}>
          <Ionicons name="search" size={18} color={theme.searchPlaceholder} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search campus"
            placeholderTextColor={theme.searchPlaceholder}
            value={searchTerm}
            onChangeText={setSearchTerm}
            onFocus={enterSearch}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchTerm("")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Clear search"
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.searchPlaceholder}
              />
            </TouchableOpacity>
          )}
        </View>
        {searchActive && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={exitSearch}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.cancelText, { color: theme.primary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {summary && (
        <View style={styles.summaryRow}>
          <Ionicons name="walk" size={22} color={theme.primary} />
          {summary.minutes && (
            <>
              <Text style={[styles.summaryTime, { color: theme.primary }]}>
                {summary.minutes}
                <Text style={styles.summaryUnit}> min</Text>
              </Text>
              <Text style={[styles.summaryDivider, { color: theme.separator }]}>
                |
              </Text>
            </>
          )}
          <Text style={[styles.summaryDistance, { color: theme.text }]}>
            {summary.distance}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.screenBg }]}>
      {/* Full-screen map */}
      <View style={StyleSheet.absoluteFill}>
        <MapBox
          stops={stops}
          triggerRerender={triggerRerender}
          toggleError={toggleError}
          buildings={options.buildings}
          jaywalking={options.jaywalking}
          grass={options.grass}
          parking={options.parking}
          topInset={insets.top}
          obscuredBottom={peekHeight}
          locationGranted={locationGranted}
        />
      </View>

      {/* Floating top controls */}
      <NavBar
        toggleAbout={toggleAbout}
        about={about}
        toggleSettings={toggleSettings}
        settings={settings}
        topInset={insets.top}
      />

      {/* Draggable search / route sheet */}
      <BottomSheet
        ref={sheetRef}
        topInset={insets.top}
        bottomInset={insets.bottom}
        header={sheetHeader}
        onPeekHeightChange={setPeekHeight}
      >
        {searchActive ? (
          <Search
            searchTerm={searchTerm}
            triggerRerender={triggerRerender}
            setStops={setStops}
            onAdded={onStopAdded}
            bottomInset={insets.bottom}
            keyboardHeight={keyboardHeight}
          />
        ) : (
          <RouteList
            triggerRerender={triggerRerender}
            setStops={setStops}
            stops={stops}
            bottomInset={insets.bottom}
            options={options}
            onToggleOption={onToggleOption}
          />
        )}
      </BottomSheet>

      {/* Invisible probe that reports the safe-area insets */}
      <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.fill} onLayout={onMeasureInsets} />
      </SafeAreaView>

      {about && <About toggleAbout={toggleAbout} />}
      {error && <ErrorModal toggleError={toggleError} />}
      {settings && (
        <Settings
          triggerRerender={triggerRerender}
          toggleSettings={toggleSettings}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  cancelButton: {
    paddingLeft: 12,
    paddingVertical: 6,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 2,
  },
  summaryTime: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  summaryUnit: {
    fontSize: 16,
    fontWeight: "600",
  },
  summaryDivider: {
    fontSize: 18,
    fontWeight: "300",
  },
  summaryDistance: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

export default HomePage;
