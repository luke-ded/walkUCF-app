import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import HomePage from "./src/HomePage";
import { hydrateStorage, localStorage } from "./src/storage";
import { ThemeContext, buildTheme } from "./src/theme";

const THEME_KEY = "walkucf:theme";

export default function App() {
  const [ready, setReady] = useState(false);
  // Until the user picks a mode, follow the device's appearance setting; the web
  // app's dark, gold-on-black design is the fallback when the OS reports nothing.
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<boolean | null>(null);
  const dark = override ?? systemScheme !== "light";

  useEffect(() => {
    hydrateStorage().finally(() => {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setOverride(saved === "dark");
      setReady(true);
    });
  }, []);

  const themeValue = {
    dark,
    toggleDark: () => {
      const next = !dark;
      setOverride(next);
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    },
    theme: buildTheme(dark),
  };

  if (!ready) {
    return (
      <View style={[styles.loader, { backgroundColor: themeValue.theme.screenBg }]}>
        <StatusBar style={dark ? "light" : "dark"} />
        <Text style={styles.wordmark}>
          <Text style={{ color: "#ffffff" }}>walk</Text>
          <Text style={{ color: themeValue.theme.primary }}>UCF</Text>
        </Text>
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
  wordmark: {
    fontSize: 46,
    fontWeight: "700",
    letterSpacing: 0.5,
    transform: [{ translateY: -16 }],
  },
});
