import React from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, useTheme, useThemeControls } from "../theme";
import logo from "../assets/logo.png";

interface ChildProps {
  toggleAbout: (about: boolean) => void;
  about: boolean;
  toggleSettings: (settings: boolean) => void;
  settings: boolean;
  topInset: number;
}

/**
 * Floating map controls that overlay the full-screen map (Apple-Maps style):
 * a compact brand pill on the upper-left and a vertical cluster of glass
 * circular buttons (theme toggle / settings / about) on the upper-right. The
 * surrounding container is `box-none` so only the buttons capture touches and
 * the rest of the map stays interactive.
 */
const NavBar: React.FC<ChildProps> = ({
  toggleAbout,
  about,
  toggleSettings,
  settings,
  topInset,
}) => {
  const theme = useTheme();
  const { dark, toggleDark } = useThemeControls();

  const aboutHandler = () => {
    toggleSettings(false);
    toggleAbout(!about);
  };

  const settingsHandler = () => {
    toggleAbout(false);
    toggleSettings(!settings);
  };

  const ControlButton: React.FC<{
    name: keyof typeof Ionicons.glyphMap;
    size: number;
    onPress: () => void;
    label: string;
  }> = ({ name, size, onPress, label }) => (
    <TouchableOpacity
      style={[
        styles.control,
        { backgroundColor: theme.controlBg, borderColor: theme.controlBorder },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.7}
    >
      <Ionicons name={name} size={size} color={theme.text} />
    </TouchableOpacity>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { top: topInset + 10 }]}
    >
      <View
        style={[
          styles.brand,
          { backgroundColor: theme.controlBg, borderColor: theme.controlBorder },
        ]}
      >
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.brandText, { color: theme.text }]}>
          walk<Text style={{ color: theme.primary }}>UCF</Text>
        </Text>
      </View>

      <View style={styles.cluster}>
        <ControlButton
          name={dark ? "sunny-outline" : "moon-outline"}
          size={22}
          onPress={toggleDark}
          label="Toggle theme"
        />
        <ControlButton
          name="settings-outline"
          size={21}
          onPress={settingsHandler}
          label="Settings"
        />
        <ControlButton
          name="information-circle-outline"
          size={23}
          onPress={aboutHandler}
          label="About"
        />
      </View>
    </View>
  );
};

const SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  android: { elevation: 4 },
  default: {},
});

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 14,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    ...SHADOW,
  },
  logo: {
    height: 24,
    width: 24,
  },
  brandText: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cluster: {
    alignItems: "center",
    gap: 10,
  },
  control: {
    height: 42,
    width: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW,
  },
});

export default NavBar;
