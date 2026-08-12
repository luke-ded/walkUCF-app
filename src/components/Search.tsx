import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import locations from "../json_files/locations.json";
import { nearestPoint } from "./Nearest";
import { localStorage } from "../storage";
import { hasGeolocation } from "../location";
import { palette, permitColor, useTheme, Theme } from "../theme";
import { useBottomSheetBody } from "./BottomSheet";
import { Item } from "../types";

interface ChildProps {
  /** Current query, owned by the sheet header (HomePage). */
  searchTerm: string;
  triggerRerender: () => void;
  setStops: (updater: (prev: Item[]) => Item[]) => void;
  /** Called after a stop is added, so the sheet can return to the route view. */
  onAdded: () => void;
  bottomInset: number;
  /** Extra bottom space to keep the last rows above the keyboard. */
  keyboardHeight: number;
}

interface ItemProps {
  item: Item;
  theme: Theme;
  addItem: (item: Item, selectedEntrance: number) => void;
  setSelectedItem: (input: string) => void;
  triggerRerender: () => void;
}

// The campus graph is dense enough that anyone actually on it is within ~100m of a
// node, so a fix further out than this is somewhere else entirely and would snap to
// an arbitrary campus node. The margin is generous so a student in an unmapped
// perimeter lot still gets to route.
const OFF_CAMPUS_KM = 1;

// How long a stored fix stays usable. The map's watch refreshes it every couple of
// seconds while Show Location is on, so anything older than this was left behind by
// an earlier session or by the setting being switched off since.
const FIX_MAX_AGE_MS = 5 * 60 * 1000;

const LOCATION_SUBTITLE = {
  ready: "Route from where you are",
  offCampus: "You appear to be off campus",
  waiting: "Finding your location…",
  off: "Show Location is off in settings",
} as const;

/** The stored position, or null when there isn't a current one to route from. */
function readFix(raw: string | null): { lat: number; lon: number } | null {
  if (raw == null || !hasGeolocation) return null;
  try {
    const [lat, lon, takenAt] = JSON.parse(raw);
    // Positions written by builds before they were stamped have no `takenAt` and
    // so read as stale, which is right — they predate this launch.
    if (typeof takenAt !== "number" || Date.now() - takenAt > FIX_MAX_AGE_MS)
      return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

/** Whether the user has the location dot — and so the position watch — turned on. */
function showLocationSetting(): boolean {
  try {
    return JSON.parse(localStorage.getItem("settings")!).showLocation !== false;
  } catch {
    return true;
  }
}

const PermitChips: React.FC<{ permits?: string[] }> = ({ permits }) => {
  if (!permits) return null;
  return (
    <>
      {permits.map((permit) => (
        <View
          key={permit}
          style={[styles.permitChip, { backgroundColor: permitColor(permit) }]}
        >
          <Text style={styles.permitText}>{permit}</Text>
        </View>
      ))}
    </>
  );
};

const EntranceButton: React.FC<{
  theme: Theme;
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ theme, label, active, onPress }) => (
  <TouchableOpacity
    style={[
      styles.entranceButton,
      active
        ? { backgroundColor: theme.primary }
        : { backgroundColor: theme.fillBg },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text
      style={[
        styles.entranceButtonText,
        { color: active ? (theme.dark ? palette.textLight : palette.textDark) : theme.text },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const ItemRenderer: React.FC<ItemProps> = ({
  item,
  theme,
  addItem,
  triggerRerender,
  setSelectedItem,
}) => {
  const [selectedEntrance, setSelectedEntrance] = useState(1);

  function handleItemChange(entrance: number) {
    setSelectedEntrance(entrance);
    setSelectedItem(item.key);
    localStorage.setItem(
      "selectedPoint",
      JSON.stringify({ ...item, selectedEntrance: entrance }),
    );
    triggerRerender();
  }

  return (
    <View style={styles.row}>
      <View style={[styles.leadingIcon, { backgroundColor: theme.fillBg }]}>
        <Ionicons name="business" size={18} color={theme.primary} />
      </View>
      <View style={styles.rowMain}>
        <View style={styles.titleLine}>
          <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <PermitChips permits={item.permitType} />
        </View>
        {item.abbreviation ? (
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            {item.abbreviation}
          </Text>
        ) : null}
        <View style={styles.entranceRow}>
          <Text style={[styles.entranceLabel, { color: theme.secondaryText }]}>
            Entrance
          </Text>
          <EntranceButton
            theme={theme}
            label="Main"
            active={selectedEntrance === 1}
            onPress={() => handleItemChange(1)}
          />
          {item.Entrances.map((entrance, index) => {
            if (index === 0 || entrance.id == undefined) return null;
            return (
              <EntranceButton
                key={entrance.id ?? index}
                theme={theme}
                label={String(index + 1)}
                active={selectedEntrance === index + 1}
                onPress={() => handleItemChange(index + 1)}
              />
            );
          })}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }]}
        onPress={() => addItem(item, selectedEntrance)}
        accessibilityRole="button"
        accessibilityLabel={`Add ${item.name} to route`}
        activeOpacity={0.8}
      >
        <Ionicons
          name="add"
          size={22}
          color={theme.dark ? palette.textLight : palette.textDark}
        />
      </TouchableOpacity>
    </View>
  );
};

const Search: React.FC<ChildProps> = ({
  searchTerm,
  triggerRerender,
  setStops,
  onAdded,
  bottomInset,
  keyboardHeight,
}) => {
  const theme = useTheme();
  const [, setSelectedItem] = useState("");
  const listRef = useRef<FlatList<Item>>(null);
  // Scrolling is handed to the sheet unless it's fully open (see BottomSheet).
  const { scrollProps } = useBottomSheetBody();

  const itemsList = locations as Item[];

  // Keep the results pinned to the most relevant matches as the query changes.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchTerm]);

  var permissionStatusData = localStorage.getItem("permissionStatus");
  const permissionStatus: boolean =
    permissionStatusData == null ? false : JSON.parse(permissionStatusData);

  function addItem(item: Item, selectedEntrance: number) {
    localStorage.setItem(
      "selectedPoint",
      JSON.stringify({ ...item, selectedEntrance }),
    );
    const newItem = { ...item, selectedEntrance };
    setStops((prevStops) => [...(prevStops || []), newItem]);
    onAdded();
  }

  // Parsed on each render rather than memoized, so the fix is aged against the
  // current time. A fix older than this is from a previous session, or from before
  // Show Location was switched off, and says nothing about where the user is now.
  const fix = readFix(localStorage.getItem("currentLocation"));

  // Keyed on the coordinates themselves: the scan walks every node in the graph,
  // and this component re-renders on each keystroke.
  const nearest = useMemo(
    () => (fix ? nearestPoint([fix.lat, fix.lon]) : null),
    [fix?.lat, fix?.lon],
  );

  const locationState = !showLocationSetting()
    ? "off"
    : nearest == null
      ? "waiting"
      : nearest.distanceKm > OFF_CAMPUS_KM
        ? "offCampus"
        : "ready";
  const canRouteFromLocation = locationState === "ready";

  const showCurrentLocation =
    searchTerm.length === 0 && hasGeolocation && permissionStatus !== false;

  // The fix is read straight from storage at render time, so nothing re-renders
  // this row when the first one lands. Poll while waiting on it; the effect tears
  // itself down as soon as a fix arrives.
  const [, setLocationTick] = useState(0);
  useEffect(() => {
    if (locationState !== "waiting" || !showCurrentLocation) return;
    const id = setInterval(() => setLocationTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [locationState, showCurrentLocation]);

  function calcNearestPoint(): Item {
    const closestPoint = nearest!.point;

    const calculatedItem: Item = {
      key: "-1",
      name: "Current Location",
      alternateName: "",
      abbreviation: "N/A",
      Entrances: [closestPoint],
      selectedEntrance: 0,
    };
    setSelectedItem(String(closestPoint.id));
    return calculatedItem;
  }

  const term = searchTerm.toLowerCase();

  const filtered = useMemo(() => {
    return itemsList
      .filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.abbreviation.toLowerCase().includes(term) ||
          item.alternateName?.toLowerCase().includes(term),
      )
      .sort((a, b) => {
        const getPriorityScore = (item: Item) => {
          if (item.name.toLowerCase().includes(term)) return 1;
          if (item.abbreviation.toLowerCase().includes(term)) return 1;
          if (item.alternateName?.toLowerCase().includes(term)) return 3;
          return 4;
        };
        return getPriorityScore(a) - getPriorityScore(b);
      });
  }, [term]);

  return (
    <FlatList
      ref={listRef}
      {...scrollProps}
      data={filtered}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator
      contentContainerStyle={{ paddingBottom: bottomInset + keyboardHeight + 16 }}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
      )}
      ListHeaderComponent={
        showCurrentLocation ? (
          <View>
            <View style={styles.row}>
              <View
                style={[
                  styles.leadingIcon,
                  {
                    backgroundColor: canRouteFromLocation
                      ? "rgba(25,117,200,0.15)"
                      : theme.fillBg,
                  },
                ]}
              >
                <Ionicons
                  name={canRouteFromLocation ? "navigate" : "navigate-outline"}
                  size={18}
                  color={canRouteFromLocation ? "#1975c8" : theme.tertiaryText}
                />
              </View>
              <View style={styles.rowMain}>
                <Text
                  style={[
                    styles.itemName,
                    {
                      color: canRouteFromLocation
                        ? theme.text
                        : theme.secondaryText,
                    },
                  ]}
                >
                  Current Location
                </Text>
                <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
                  {LOCATION_SUBTITLE[locationState]}
                </Text>
              </View>
              {/* Without a current on-campus fix there is no sensible node to snap
                  to, so adding is blocked rather than routing from an arbitrary
                  corner of campus (or from an entrance that doesn't exist). */}
              <TouchableOpacity
                style={[
                  styles.addButton,
                  {
                    backgroundColor: canRouteFromLocation
                      ? theme.primary
                      : theme.fillBg,
                  },
                ]}
                onPress={() => addItem(calcNearestPoint(), 1)}
                disabled={!canRouteFromLocation}
                accessibilityRole="button"
                accessibilityLabel="Add current location to route"
                accessibilityState={{ disabled: !canRouteFromLocation }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="add"
                  size={22}
                  color={
                    !canRouteFromLocation
                      ? theme.tertiaryText
                      : theme.dark
                        ? palette.textLight
                        : palette.textDark
                  }
                />
              </TouchableOpacity>
            </View>
            <View style={[styles.separator, { backgroundColor: theme.separator }]} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="search" size={26} color={theme.tertiaryText} />
          <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
            No places match “{searchTerm}”.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <ItemRenderer
          item={item}
          theme={theme}
          addItem={addItem}
          triggerRerender={triggerRerender}
          setSelectedItem={setSelectedItem}
        />
      )}
    />
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  leadingIcon: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowMain: {
    flex: 1,
  },
  titleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  entranceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  entranceLabel: {
    fontSize: 13,
    marginRight: 2,
  },
  entranceButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 30,
    alignItems: "center",
  },
  entranceButtonText: {
    fontWeight: "600",
    fontSize: 13,
  },
  addButton: {
    height: 34,
    width: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  permitChip: {
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  permitText: {
    fontSize: 8,
    fontWeight: "700",
    color: palette.textDark,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    gap: 10,
  },
  emptyText: {
    fontSize: 15,
  },
});

export default Search;
