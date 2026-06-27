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
        { color: active ? (theme.dark ? palette.textDark : palette.textLight) : theme.text },
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
          color={theme.dark ? palette.textDark : palette.textLight}
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

  function calcNearestPoint(): Item {
    var closestPoint: any = { id: -1, lat: -1, lon: -1 };
    var currentLocationData = localStorage.getItem("currentLocation");

    if (currentLocationData == null || !hasGeolocation)
      return {
        key: "-1",
        name: "Current Location",
        abbreviation: "N/A",
        Entrances: [closestPoint],
        selectedEntrance: 0,
      };

    var currentLocation = JSON.parse(currentLocationData);
    closestPoint = nearestPoint([currentLocation[0], currentLocation[1]]);

    const calculatedItem: Item = {
      key: "-1",
      name: "Current Location",
      alternateName: "",
      abbreviation: "N/A",
      Entrances: [closestPoint],
      selectedEntrance: 0,
    };
    setSelectedItem(closestPoint.id);
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

  const showCurrentLocation =
    searchTerm.length === 0 && hasGeolocation && permissionStatus !== false;

  return (
    <FlatList
      ref={listRef}
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
              <View style={[styles.leadingIcon, { backgroundColor: "rgba(25,117,200,0.15)" }]}>
                <Ionicons name="navigate" size={18} color="#1975c8" />
              </View>
              <View style={styles.rowMain}>
                <Text style={[styles.itemName, { color: theme.text }]}>
                  Current Location
                </Text>
                <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
                  Route from where you are
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                onPress={() => addItem(calcNearestPoint(), 1)}
                accessibilityRole="button"
                accessibilityLabel="Add current location to route"
                activeOpacity={0.8}
              >
                <Ionicons
                  name="add"
                  size={22}
                  color={theme.dark ? palette.textDark : palette.textLight}
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
