import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { localStorage } from "../storage";
import { hasGeolocation } from "../location";
import { useTheme } from "../theme";
import { Settings as SettingsType } from "../types";

interface ChildProps {
  triggerRerender: () => void;
  toggleSettings: (settings: boolean) => void;
}

const Settings: React.FC<ChildProps> = ({ triggerRerender, toggleSettings }) => {
  const theme = useTheme();

  var settingsData = localStorage.getItem("settings");
  let settings: SettingsType;
  if (settingsData == null) {
    settings = {
      units: "imperial",
      walkSpeed: 3,
      saveRoute: true,
      showLocation: true,
    };
    localStorage.setItem("settings", JSON.stringify(settings));
  } else {
    settings = JSON.parse(settingsData);
  }

  const startUnits =
    settings.units === "imperial"
      ? String(settings.walkSpeed.toFixed(1))
      : String((settings.walkSpeed / 0.621371).toFixed(1));

  var permissionStatusData = localStorage.getItem("permissionStatus");
  const permissionStatus =
    permissionStatusData == null ? null : JSON.parse(permissionStatusData);

  const [units, setUnits] = useState<SettingsType["units"]>(settings.units);
  const [walkSpeed, setWalkSpeed] = useState(settings.walkSpeed);
  const [newWalkSpeed, setNewWalkSpeed] = useState(startUnits);
  const [saveRoute, setSaveRoute] = useState(settings.saveRoute);
  const [showLocation, setShowLocation] = useState(settings.showLocation);
  const [info, setInfo] = useState(false);

  function setWalkSpeedHandler(inputWalkSpeed: string) {
    setNewWalkSpeed(inputWalkSpeed);
    setSaveRoute(true);

    if (!isNaN(Number(inputWalkSpeed))) {
      if (units === "imperial") setWalkSpeed(Number(inputWalkSpeed));
      else setWalkSpeed(Number(inputWalkSpeed) * 0.621371);
    }
  }

  function setUnitsHandler(val: SettingsType["units"]) {
    if (!isNaN(Number(newWalkSpeed))) {
      if (val === "imperial" && units === "metric") {
        setWalkSpeedHandler(String((Number(newWalkSpeed) * 0.621371).toFixed(1)));
      } else if (val === "metric" && units === "imperial") {
        setWalkSpeedHandler(String((Number(newWalkSpeed) / 0.621371).toFixed(1)));
      }
    }
    setUnits(val);
  }

  function save() {
    let speed = walkSpeed;
    if (speed <= 0) speed = 3;

    localStorage.setItem(
      "settings",
      JSON.stringify({ units, walkSpeed: speed, saveRoute, showLocation }),
    );
    triggerRerender();
    toggleSettings(false);
  }

  function cancel() {
    toggleSettings(false);
  }

  const Toggle: React.FC<{
    leftLabel: string;
    rightLabel: string;
    leftActive: boolean;
    onLeft: () => void;
    onRight: () => void;
  }> = ({ leftLabel, rightLabel, leftActive, onLeft, onRight }) => (
    <View style={[styles.toggle, { borderColor: theme.primary, backgroundColor: theme.inputBg }]}>
      <TouchableOpacity
        style={[
          styles.toggleHalf,
          { borderRightColor: theme.primary, borderRightWidth: 2 },
          leftActive && styles.toggleActive,
        ]}
        onPress={onLeft}
      >
        <Text style={{ color: theme.text }}>{leftLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleHalf, !leftActive && styles.toggleActive]}
        onPress={onRight}
      >
        <Text style={{ color: theme.text }}>{rightLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { borderColor: theme.primary, backgroundColor: theme.panelSolid }]}>
          <View style={[styles.cardHeader, { borderBottomColor: theme.primary }]}>
            <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Units:</Text>
              <Toggle
                leftLabel="Imperial"
                rightLabel="Metric"
                leftActive={units === "imperial"}
                onLeft={() => setUnitsHandler("imperial")}
                onRight={() => setUnitsHandler("metric")}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Walking Speed:</Text>
              <TextInput
                style={[styles.speedInput, { borderColor: theme.primary, backgroundColor: theme.inputBg, color: theme.text }]}
                placeholder="3.0"
                placeholderTextColor={theme.subText}
                keyboardType="decimal-pad"
                value={newWalkSpeed}
                onChangeText={setWalkSpeedHandler}
              />
              <Text style={[styles.unitLabel, { color: theme.text }]}>
                {units === "imperial" ? "mi/hr" : "km/hr"}
              </Text>
              <TouchableOpacity onPress={() => setInfo(!info)}>
                <MaterialIcons name="info-outline" size={20} color={theme.primary} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>

            {info && (
              <View style={[styles.infoBox, { borderColor: theme.primary, backgroundColor: theme.panelSolid }]}>
                <Text style={[styles.infoText, { color: theme.text }]}>
                  If you wear a smartwatch, check your health app for the most
                  accurate measure of this stat. Otherwise, calculate it yourself
                  or leave the default setting of{" "}
                  {units === "imperial" ? "3.0 mi/hr" : "4.8 km/hr"}.
                </Text>
                <TouchableOpacity onPress={() => setInfo(false)}>
                  <Ionicons name="close" size={16} color={theme.text} />
                </TouchableOpacity>
              </View>
            )}

            {hasGeolocation && permissionStatus && (
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Show Location:</Text>
                <Toggle
                  leftLabel="Yes"
                  rightLabel="No"
                  leftActive={showLocation}
                  onLeft={() => setShowLocation(true)}
                  onRight={() => setShowLocation(false)}
                />
              </View>
            )}
          </View>
          <View style={styles.cardFooter}>
            <TouchableOpacity style={[styles.footerButton, { borderColor: theme.primary, backgroundColor: theme.inputBg }]} onPress={save}>
              <Text style={{ color: theme.text }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerButton, { borderColor: theme.primary, backgroundColor: theme.inputBg }]} onPress={cancel}>
              <Text style={{ color: theme.text }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  cardHeader: {
    alignItems: "center",
    borderBottomWidth: 2,
    paddingVertical: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  cardBody: {
    padding: 20,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
    flexWrap: "wrap",
  },
  settingLabel: {
    fontSize: 18,
    marginRight: 8,
  },
  toggle: {
    flexDirection: "row",
    height: 40,
    width: 152,
    borderWidth: 2,
    borderRadius: 12,
    overflow: "hidden",
  },
  toggleHalf: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: "rgba(255,230,140,0.35)",
  },
  speedInput: {
    width: 64,
    height: 40,
    borderWidth: 2,
    borderRadius: 8,
    textAlign: "center",
    fontSize: 17,
  },
  unitLabel: {
    marginLeft: 8,
    fontSize: 16,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 2,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    gap: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "center",
    paddingBottom: 20,
    gap: 12,
  },
  footerButton: {
    height: 40,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Settings;
