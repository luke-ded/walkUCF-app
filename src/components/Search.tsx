import React, { useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
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
  triggerRerender: () => void;
  setStops: (updater: (prev: Item[]) => Item[]) => void;
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
    <View style={styles.itemBody}>
      <View style={styles.itemHeader}>
        <View style={styles.itemNameWrap}>
          <Text style={[styles.itemName, { color: theme.text }]}>
            {item.name}
          </Text>
          <PermitChips permits={item.permitType} />
        </View>
        <Text style={[styles.abbrev, { color: theme.primary }]}>
          {item.abbreviation}
        </Text>
      </View>
      <View style={styles.entranceRow}>
        <View style={styles.entranceButtons}>
          <Text style={[styles.entranceLabel, { color: theme.subText }]}>
            Entrance:{" "}
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
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
          onPress={() => addItem(item, selectedEntrance)}
        >
          <Ionicons name="add" size={20} color={theme.dark ? palette.textLight : palette.textDark} />
        </TouchableOpacity>
      </View>
    </View>
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
      { borderColor: theme.primary },
      active
        ? { backgroundColor: "rgba(255,202,9,0.5)" }
        : { backgroundColor: theme.primary },
    ]}
    onPress={onPress}
  >
    <Text
      style={{
        fontWeight: "700",
        fontSize: 13,
        color: active ? theme.text : palette.textDark,
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const Search: React.FC<ChildProps> = ({ triggerRerender, setStops }) => {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [, setSelectedItem] = useState("");

  const itemsList = locations as Item[];

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
    <View style={styles.container}>
      <View style={[styles.searchBarWrap, { borderColor: theme.primary, backgroundColor: theme.inputBg }]}>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search"
          placeholderTextColor={theme.dark ? "rgba(229,229,229,0.6)" : "rgba(64,64,64,0.6)"}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        <Ionicons name="search" size={22} color={theme.text} style={styles.searchIcon} />
      </View>
      <View style={[styles.listWrap, { borderColor: theme.primary, backgroundColor: theme.panelBg }]}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            showCurrentLocation ? (
              <View style={[styles.row, styles.currentRow, { borderBottomColor: theme.primary }]}>
                <View style={styles.currentLabelWrap}>
                  <Text style={[styles.itemName, { color: theme.text, fontWeight: "700" }]}>
                    Current Location
                  </Text>
                  <Ionicons name="navigate" size={20} color="#1975c8" style={{ marginLeft: 8 }} />
                </View>
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  onPress={() => addItem(calcNearestPoint(), 1)}
                >
                  <Ionicons name="add" size={20} color={theme.dark ? palette.textLight : palette.textDark} />
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: theme.primary }]}>
              <ItemRenderer
                item={item}
                theme={theme}
                addItem={addItem}
                triggerRerender={triggerRerender}
                setSelectedItem={setSelectedItem}
              />
            </View>
          )}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  listWrap: {
    flex: 1,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  currentLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemBody: {
    width: "100%",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  itemNameWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
  },
  abbrev: {
    fontSize: 12,
    marginLeft: 6,
    marginTop: 2,
  },
  entranceRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entranceButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  entranceLabel: {
    fontSize: 14,
  },
  entranceButton: {
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  addButton: {
    borderWidth: 2,
    borderRadius: 4,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  permitChip: {
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  permitText: {
    fontSize: 8,
    fontWeight: "600",
    color: palette.textDark,
  },
});

export default Search;
