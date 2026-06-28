import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { localStorage } from "../storage";
import { palette, permitColor, useTheme, Theme } from "../theme";
import { Item } from "../types";

export type RouteOptionKey = "buildings" | "jaywalking" | "parking" | "grass";

// Fixed row height keeps the drag math simple: every slot is exactly this tall,
// so a row's target index is just its pixel offset divided by ROW_HEIGHT.
const ROW_HEIGHT = 64;

interface ChildProps {
  triggerRerender: () => void;
  setStops: (stops: Item[]) => void;
  stops: Item[];
  bottomInset: number;
  options: Record<RouteOptionKey, boolean>;
  onToggleOption: (key: RouteOptionKey) => void;
}

const OPTION_DEFS: { key: RouteOptionKey; label: string }[] = [
  { key: "buildings", label: "Buildings" },
  { key: "jaywalking", label: "Jaywalking" },
  { key: "parking", label: "Parking" },
  { key: "grass", label: "Grass" },
];

const RouteOptions: React.FC<{
  theme: Theme;
  options: Record<RouteOptionKey, boolean>;
  onToggle: (key: RouteOptionKey) => void;
}> = ({ theme, options, onToggle }) => (
  <View style={styles.optionsBlock}>
    <Text style={[styles.sectionLabel, { color: theme.secondaryText }]}>
      Route options
    </Text>
    <View style={styles.optionsGrid}>
      {OPTION_DEFS.map(({ key, label }) => {
        const on = options[key];
        const onColor = theme.dark ? palette.textDark : palette.textLight;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onToggle(key)}
            activeOpacity={0.7}
            style={[
              styles.optionChip,
              on
                ? { backgroundColor: theme.primary, borderColor: theme.primary }
                : { backgroundColor: theme.fillBg, borderColor: theme.fillBg },
            ]}
          >
            <Ionicons
              name={on ? "checkmark-circle" : "ellipse-outline"}
              size={17}
              color={on ? onColor : theme.secondaryText}
            />
            <Text
              style={[styles.optionChipText, { color: on ? onColor : theme.text }]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const RouteList: React.FC<ChildProps> = ({
  triggerRerender,
  setStops,
  stops,
  bottomInset,
  options,
  onToggleOption,
}) => {
  const theme = useTheme();
  const [, setSelectedItem] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const itemsList = stops;

  // Live translation of the row being dragged (relative to its home slot), plus
  // a per-row offset that animates neighbours out of the way to open a gap.
  const dragY = useRef(new Animated.Value(0)).current;
  const offsets = useRef<Animated.Value[]>([]);
  if (offsets.current.length !== itemsList.length) {
    offsets.current = itemsList.map(() => new Animated.Value(0));
  }
  // Where the dragged row would land if released right now.
  const toIndexRef = useRef(0);
  // Latest list, so PanResponder callbacks reorder against current data.
  const dataRef = useRef(itemsList);
  dataRef.current = itemsList;

  function removeStop(item: Item) {
    const index = itemsList.indexOf(item);
    if (index < 0) return;

    const newItemsList = [
      ...itemsList.slice(0, index),
      ...itemsList.slice(index + 1),
    ];

    if (newItemsList.length === 0) {
      localStorage.setItem(
        "graphData",
        JSON.stringify({ distanceMi: 0, distanceKm: 0 }),
      );
    }
    setStops(newItemsList);
  }

  function handleItemChange(item: Item) {
    setSelectedItem(item.key);
    localStorage.setItem("selectedPoint", JSON.stringify(item));
    triggerRerender();
  }

  function clearList() {
    localStorage.setItem(
      "graphData",
      JSON.stringify({ distanceMi: 0, distanceKm: 0 }),
    );
    setStops([]);
  }

  // Slide neighbouring rows to make room for the dragged row at `to`.
  function shiftNeighbours(from: number, to: number) {
    offsets.current.forEach((off, i) => {
      if (i === from) return;
      let target = 0;
      if (from < to && i > from && i <= to) target = -ROW_HEIGHT;
      else if (from > to && i < from && i >= to) target = ROW_HEIGHT;
      Animated.spring(off, {
        toValue: target,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    });
  }

  // One PanResponder per slot; rebuilt whenever the list changes so the captured
  // index always matches the row's current position.
  const responders = useMemo(
    () =>
      itemsList.map((_item, index) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: () => {
            dragY.setValue(0);
            offsets.current.forEach((o) => o.setValue(0));
            toIndexRef.current = index;
            setActiveIndex(index);
          },
          onPanResponderMove: (_e, g) => {
            dragY.setValue(g.dy);
            const len = dataRef.current.length;
            const to = Math.max(
              0,
              Math.min(len - 1, Math.round(index + g.dy / ROW_HEIGHT)),
            );
            if (to !== toIndexRef.current) {
              toIndexRef.current = to;
              shiftNeighbours(index, to);
            }
          },
          onPanResponderRelease: () => {
            const from = index;
            const to = toIndexRef.current;
            const finish = () => {
              dragY.setValue(0);
              offsets.current.forEach((o) => o.setValue(0));
              setActiveIndex(null);
              if (to !== from) {
                const arr = [...dataRef.current];
                const [moved] = arr.splice(from, 1);
                arr.splice(to, 0, moved);
                setStops(arr);
              }
            };
            // Glide the dragged row into the opened gap, then commit the order.
            Animated.spring(dragY, {
              toValue: (to - from) * ROW_HEIGHT,
              useNativeDriver: true,
              bounciness: 0,
              speed: 20,
            }).start(finish);
          },
          onPanResponderTerminate: () => {
            dragY.setValue(0);
            offsets.current.forEach((o) => o.setValue(0));
            setActiveIndex(null);
          },
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsList],
  );

  const renderRow = (item: Item, index: number) => {
    const isCurrentLocation = item.name === "Current Location";
    const entranceLabel =
      item.selectedEntrance === -1
        ? "Closest entrance"
        : item.selectedEntrance === 1
          ? "Main entrance"
          : "Door " + item.selectedEntrance;
    const first = index === 0;
    const last = index === itemsList.length - 1;
    const active = index === activeIndex;

    return (
      <Animated.View
        key={index}
        style={[
          styles.rowAbsolute,
          {
            top: index * ROW_HEIGHT,
            backgroundColor: theme.sheetBg,
            transform: [
              { translateY: active ? dragY : offsets.current[index] },
            ],
            zIndex: active ? 10 : 0,
          },
          active && styles.rowActive,
        ]}
      >
        <TouchableOpacity
          onPress={() => handleItemChange(item)}
          activeOpacity={0.6}
          style={styles.rowTap}
        >
          <View style={styles.indexColumn}>
            <View
              style={[styles.indexBadge, { backgroundColor: theme.primary }]}
            >
              {isCurrentLocation ? (
                <Ionicons
                  name="navigate"
                  size={13}
                  color={theme.dark ? palette.textDark : palette.textLight}
                />
              ) : (
                <Text
                  style={[
                    styles.indexText,
                    {
                      color: theme.dark ? palette.textDark : palette.textLight,
                    },
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.rowMain}>
            <View style={styles.titleLine}>
              <Text
                style={[styles.name, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {item.permitType?.map((permit) => (
                <View
                  key={permit}
                  style={[
                    styles.permitChip,
                    { backgroundColor: permitColor(permit) },
                  ]}
                >
                  <Text style={styles.permitText}>{permit}</Text>
                </View>
              ))}
            </View>
            <Text
              style={[styles.meta, { color: theme.secondaryText }]}
              numberOfLines={1}
            >
              {first ? "Start" : last ? "Destination" : "Stop " + (index + 1)}
              {item.abbreviation ? "  ·  " + item.abbreviation : ""}
              {!isCurrentLocation ? "  ·  " + entranceLabel : ""}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.controls}>
          <View
            style={styles.dragHandle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            {...responders[index].panHandlers}
          >
            <Ionicons
              name="reorder-three"
              size={24}
              color={theme.tertiaryText}
            />
          </View>
          <TouchableOpacity
            style={[styles.removeButton, { backgroundColor: theme.fillBg }]}
            onPress={() => removeStop(item)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="close" size={16} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        {!last && (
          <View
            style={[styles.separator, { backgroundColor: theme.separator }]}
          />
        )}
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <RouteOptions theme={theme} options={options} onToggle={onToggleOption} />

      {itemsList.length > 0 && (
        <View style={styles.subHeader}>
          <Text style={[styles.subHeaderTitle, { color: theme.text }]}>
            {itemsList.length} {itemsList.length === 1 ? "stop" : "stops"}
          </Text>
          <TouchableOpacity
            onPress={clearList}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.clearText, { color: theme.primary }]}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {itemsList.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="map-outline" size={34} color={theme.tertiaryText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No destinations yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
            Tap the search bar above to add buildings and plan the fastest walk
            across campus.
          </Text>
        </View>
      ) : (
        <ScrollView
          // Lock scrolling mid-drag so the gesture moves only the grabbed row.
          scrollEnabled={activeIndex === null}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            {
              height: itemsList.length * ROW_HEIGHT,
              paddingBottom: bottomInset + 16,
            },
          ]}
        >
          {itemsList.map((item, index) => renderRow(item, index))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  optionsBlock: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
  },
  optionChip: {
    flexGrow: 1,
    flexBasis: "40%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  subHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  clearText: {
    fontSize: 15,
    fontWeight: "600",
  },
  listContent: {
    flexGrow: 1,
  },
  rowAbsolute: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  rowActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  rowTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  separator: {
    position: "absolute",
    bottom: 0,
    left: 52,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  indexColumn: {
    width: 32,
    alignItems: "flex-start",
  },
  indexBadge: {
    height: 24,
    width: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: {
    fontSize: 13,
    fontWeight: "700",
  },
  rowMain: {
    flex: 1,
    marginRight: 8,
  },
  titleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dragHandle: {
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButton: {
    height: 28,
    width: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
    paddingHorizontal: 36,
    paddingTop: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 19,
  },
});

export default RouteList;
