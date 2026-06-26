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
import { GraphData, Item, Settings } from "../types";

interface ChildProps {
  triggerRerender: () => void;
  setStops: (stops: Item[]) => void;
  stops: Item[];
}

const RouteList: React.FC<ChildProps> = ({
  triggerRerender,
  setStops,
  stops,
}) => {
  const theme = useTheme();
  const [, setSelectedItem] = useState("");

  const itemsList = stops;
  const graphData: GraphData = JSON.parse(localStorage.getItem("graphData")!);
  const settings: Settings = JSON.parse(localStorage.getItem("settings")!);

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

  const renderItem = (item: Item, index: number) => {
    const entranceLabel =
      item.selectedEntrance === -1
        ? "Closest Entrance"
        : item.selectedEntrance === 1
          ? "Main Entrance"
          : "Door " + item.selectedEntrance;

    return (
      <TouchableOpacity
        onPress={() => handleItemChange(item)}
        style={[styles.row, { borderBottomColor: theme.primary }]}
      >
        <View style={styles.rowTop}>
          <View style={styles.nameWrap}>
            <Text style={[styles.name, { color: theme.text }]}>
              {item.name}
            </Text>
            {item.name === "Current Location" && (
              <Ionicons name="navigate" size={18} color="#1975c8" style={{ marginLeft: 6 }} />
            )}
            {item.permitType?.map((permit) => (
              <View
                key={permit}
                style={[styles.permitChip, { backgroundColor: permitColor(permit) }]}
              >
                <Text style={styles.permitText}>{permit}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
            onPress={() => removeStop(item)}
          >
            <Ionicons name="close" size={18} color={theme.dark ? palette.textLight : palette.textDark} />
          </TouchableOpacity>
        </View>
        <View style={styles.rowBottom}>
          <View style={styles.metaWrap}>
            <Text style={[styles.metaAccent, { color: theme.primary }]}>
              {item.abbreviation}
            </Text>
            <Text style={[styles.meta, { color: theme.text }]}>
              {" "}| Stop {index + 1}
            </Text>
            {item.name !== "Current Location" && (
              <Text style={[styles.meta, { color: theme.text }]}>
                {" "}| {entranceLabel}
              </Text>
            )}
          </View>
          <View style={styles.reorderWrap}>
            <TouchableOpacity
              style={[styles.reorderButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
              onPress={() => swapDown(item)}
            >
              <Text style={[styles.reorderText, { color: theme.dark ? palette.textLight : palette.textDark }]}>▼</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reorderButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
              onPress={() => swapUp(item)}
            >
              <Text style={[styles.reorderText, { color: theme.dark ? palette.textLight : palette.textDark }]}>▲</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { borderColor: theme.primary, backgroundColor: theme.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: theme.primary }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Route</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.headerStat, { color: theme.subText }]}>
            {walkMinutes} min <Text style={{ fontWeight: "700", color: theme.text }}>|</Text> {distanceLabel}
          </Text>
          <TouchableOpacity
            style={[styles.clearButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
            onPress={clearList}
          >
            <Text style={[styles.clearText, { color: theme.dark ? palette.textLight : palette.textDark }]}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={itemsList}
        keyExtractor={(_item, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => renderItem(item, index)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerStat: {
    fontSize: 14,
  },
  clearButton: {
    marginLeft: 10,
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  clearText: {
    fontWeight: "700",
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  nameWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowBottom: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
  },
  metaAccent: {
    fontSize: 13,
  },
  meta: {
    fontSize: 13,
  },
  reorderWrap: {
    flexDirection: "row",
  },
  reorderButton: {
    marginLeft: 6,
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reorderText: {
    fontSize: 16,
    fontWeight: "700",
  },
  iconButton: {
    borderWidth: 2,
    borderRadius: 4,
    padding: 6,
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

export default RouteList;
