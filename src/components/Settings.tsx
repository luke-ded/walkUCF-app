import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { localStorage } from "../storage";
import { hasGeolocation } from "../location";
import { palette, useTheme } from "../theme";
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
  }> = ({ leftLabel, rightLabel, leftActive, onLeft, onRight }) => {
    const activeText = theme.dark ? palette.textLight : palette.textDark;
    return (
      <View style={[styles.toggle, { backgroundColor: theme.fillBg }]}>
        <TouchableOpacity
          style={[
            styles.toggleHalf,
            leftActive && { backgroundColor: theme.primary },
          ]}
          onPress={onLeft}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.toggleText,
              { color: leftActive ? activeText : theme.text },
            ]}
          >
            {leftLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleHalf,
            !leftActive && { backgroundColor: theme.primary },
          ]}
          onPress={onRight}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.toggleText,
              { color: !leftActive ? activeText : theme.text },
            ]}
          >
            {rightLabel}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.cardBg, borderColor: theme.controlBorder },
          ]}
        >
          <View style={[styles.cardHeader, { borderBottomColor: theme.separator }]}>
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
                style={[styles.speedInput, { backgroundColor: theme.fillBg, color: theme.text }]}
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
              <View style={[styles.infoBox, { backgroundColor: theme.fillBg }]}>
                <Text style={[styles.infoText, { color: theme.secondaryText }]}>
                  If you wear a smartwatch, check your health app for the most
                  accurate measure of this stat. Otherwise, calculate it yourself
                  or leave the default setting of{" "}
                  {units === "imperial" ? "3.0 mi/hr" : "4.8 km/hr"}.
                </Text>
                <TouchableOpacity onPress={() => setInfo(false)}>
                  <Ionicons name="close" size={16} color={theme.secondaryText} />
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
            <TouchableOpacity
              style={[styles.footerButton, { backgroundColor: theme.fillBg }]}
              onPress={cancel}
              activeOpacity={0.8}
            >
              <Text style={[styles.footerButtonText, { color: theme.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerButton, { backgroundColor: theme.primary }]}
              onPress={save}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.footerButtonText,
                  { color: theme.dark ? palette.textLight : palette.textDark },
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  android: { elevation: 16 },
  default: {},
});

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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
    ...SHADOW,
  },
  cardHeader: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    paddingBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  cardBody: {
    padding: 20,
    paddingTop: 12,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
    flexWrap: "wrap",
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginRight: 10,
  },
  toggle: {
    flexDirection: "row",
    height: 36,
    width: 152,
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  toggleHalf: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  speedInput: {
    width: 64,
    height: 40,
    borderRadius: 10,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
  },
  unitLabel: {
    marginLeft: 8,
    fontSize: 15,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  footerButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

export default Settings;
