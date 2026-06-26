import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import HomePage from "./src/HomePage";
import { hydrateStorage } from "./src/storage";
import { ThemeContext, buildTheme } from "./src/theme";

export default function App() {
  const [ready, setReady] = useState(false);
  // The web app defaults to a dark, gold-on-black design.
  const [dark, setDark] = useState(true);

  useEffect(() => {
    hydrateStorage().finally(() => setReady(true));
  }, []);

  const themeValue = {
    dark,
    toggleDark: () => setDark((d) => !d),
    theme: buildTheme(dark),
  };

  if (!ready) {
    return (
      <View style={[styles.loader, { backgroundColor: themeValue.theme.screenBg }]}>
        <StatusBar style={dark ? "light" : "dark"} />
        <ActivityIndicator size="large" color={themeValue.theme.primary} />
      </View>
    );
  }

  return (
    <ThemeContext.Provider value={themeValue}>
      <StatusBar style={dark ? "light" : "dark"} />
      <HomePage />
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
