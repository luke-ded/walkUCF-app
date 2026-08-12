import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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

  return (
    // SafeAreaProvider must sit above HomePage, which reads the insets through
    // `useSafeAreaInsets` (react-native's own SafeAreaView is deprecated in 0.86
    // and does not report insets on a resizable iPad window).
    <SafeAreaProvider>
      <ThemeContext.Provider value={themeValue}>
        <StatusBar style={dark ? "light" : "dark"} />
        {ready ? (
          <HomePage />
        ) : (
          <View
            style={[
              styles.loader,
              { backgroundColor: themeValue.theme.screenBg },
            ]}
          >
            <Text style={styles.wordmark}>
              {/* Pure white in dark mode so this hands off seamlessly from the
                  launch screen's wordmark; in light mode that would be nearly
                  invisible on the light background, so follow the theme. */}
              <Text style={{ color: dark ? "#ffffff" : themeValue.theme.text }}>
                walk
              </Text>
              <Text style={{ color: themeValue.theme.primary }}>UCF</Text>
            </Text>
          </View>
        )}
      </ThemeContext.Provider>
    </SafeAreaProvider>
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
