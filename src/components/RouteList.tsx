import React, { useState } from "react";
import {
  FlatList,
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

  const itemsList = stops;

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

  function swap(index1: number, index2: number) {
    const newItemsList = [...itemsList];
    const temp = newItemsList[index1];
    newItemsList[index1] = newItemsList[index2];
    newItemsList[index2] = temp;
    setStops(newItemsList);
  }

  function swapDown(item: Item) {
    const index = itemsList.indexOf(item);
    if (index < 0 || itemsList.length - 1 === index) return;
    swap(index, index + 1);
  }

  function swapUp(item: Item) {
    const index = itemsList.indexOf(item);
    if (index <= 0) return;
    swap(index - 1, index);
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

  const renderItem = (item: Item, index: number) => {
    const isCurrentLocation = item.name === "Current Location";
    const entranceLabel =
      item.selectedEntrance === -1
        ? "Closest entrance"
        : item.selectedEntrance === 1
          ? "Main entrance"
          : "Door " + item.selectedEntrance;
    const first = index === 0;
    const last = index === itemsList.length - 1;

    return (
      <TouchableOpacity
        onPress={() => handleItemChange(item)}
        activeOpacity={0.6}
        style={styles.row}
      >
        <View style={styles.indexColumn}>
          <View style={[styles.indexBadge, { backgroundColor: theme.primary }]}>
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
                  { color: theme.dark ? palette.textDark : palette.textLight },
                ]}
              >
                {index + 1}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rowMain}>
          <View style={styles.titleLine}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.permitType?.map((permit) => (
              <View
                key={permit}
                style={[styles.permitChip, { backgroundColor: permitColor(permit) }]}
              >
                <Text style={styles.permitText}>{permit}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.meta, { color: theme.secondaryText }]} numberOfLines={1}>
            {first ? "Start" : last ? "Destination" : "Stop " + (index + 1)}
            {item.abbreviation ? "  ·  " + item.abbreviation : ""}
            {!isCurrentLocation ? "  ·  " + entranceLabel : ""}
          </Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.reorderColumn}>
            <TouchableOpacity
              onPress={() => swapUp(item)}
              disabled={first}
              hitSlop={{ top: 4, bottom: 2, left: 6, right: 6 }}
              style={first && styles.controlDisabled}
            >
              <Ionicons name="chevron-up" size={18} color={theme.secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => swapDown(item)}
              disabled={last}
              hitSlop={{ top: 2, bottom: 4, left: 6, right: 6 }}
              style={last && styles.controlDisabled}
            >
              <Ionicons name="chevron-down" size={18} color={theme.secondaryText} />
            </TouchableOpacity>
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
      </TouchableOpacity>
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
            <Text style={[styles.clearText, { color: theme.primary }]}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={itemsList}
        keyExtractor={(_item, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.separator }]} />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomInset + 16 },
        ]}
        ListEmptyComponent={
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
        }
        renderItem={({ item, index }) => renderItem(item, index)}
      />
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
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
  reorderColumn: {
    alignItems: "center",
  },
  controlDisabled: {
    opacity: 0.3,
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
