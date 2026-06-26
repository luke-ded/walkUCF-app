import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, useThemeControls } from "../theme";
import logo from "../assets/logo.png";

interface ChildProps {
  toggleAbout: (about: boolean) => void;
  about: boolean;
  toggleSettings: (settings: boolean) => void;
  settings: boolean;
}

const NavBar: React.FC<ChildProps> = ({
  toggleAbout,
  about,
  toggleSettings,
  settings,
}) => {
  const { dark, toggleDark } = useThemeControls();

  const aboutHandler = () => {
    toggleSettings(false);
    toggleAbout(!about);
  };

  const settingsHandler = () => {
    toggleAbout(false);
    toggleSettings(!settings);
  };

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>walkUCF</Text>
      </View>
      <View style={styles.right}>
        <TouchableOpacity style={styles.iconButton} onPress={toggleDark}>
          <Ionicons
            name={dark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={palette.textDark}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={settingsHandler}>
          <Ionicons name="settings-outline" size={24} color={palette.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={aboutHandler}>
          <Ionicons
            name="information-circle-outline"
            size={26}
            color={palette.textDark}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 56,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderBottomWidth: 2,
    borderBottomColor: palette.goldBright,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    height: 32,
    width: 32,
  },
  title: {
    marginLeft: 10,
    fontSize: 26,
    fontWeight: "600",
    color: palette.textDark,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    marginLeft: 10,
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,230,140,0.3)",
  },
});

export default NavBar;
