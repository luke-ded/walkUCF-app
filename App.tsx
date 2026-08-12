import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import HomePage from "./src/HomePage";
import { hydrateStorage, localStorage } from "./src/storage";
import { ThemeContext, buildTheme, palette } from "./src/theme";

const THEME_KEY = "walkucf:theme";
// Must stay in step with the `backgroundColor` of the expo-splash-screen plugin
// in app.json, which is what the native launch screen paints.
const SPLASH_BG = "#141414";

// expo-splash-screen tears the launch screen down as soon as React mounts, which
// is a frame or two before anything is painted over it — long enough to flash the
// root view's white background. Hold it until `ready`, then hand off below.
SplashScreen.preventAutoHideAsync().catch(() => {});

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

  // Drop the launch screen only once HomePage has been committed, so the app is
  // revealed in one step instead of through a blank frame.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

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
    // and does not report insets on a resizable iPad window). `initialMetrics`
    // is required here: without it the provider renders no children at all until
    // the native insets arrive, leaving the launch screen handing off to a blank
    // white root view.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeContext.Provider value={themeValue}>
        {/* The loader below is always dark, so keep light glyphs over it even
            when the device is in light mode. */}
        <StatusBar style={!ready || dark ? "light" : "dark"} />
        {ready ? (
          <HomePage />
        ) : (
          // This is a continuation of the launch screen rather than an app
          // screen, so it copies assets/splash.png literally — dark ground and
          // pure white "walk" in both appearances — instead of following the
          // theme. The launch screen has no light variant, so a themed loader
          // would break the handoff every time the device is in light mode.
          <View style={[styles.loader, { backgroundColor: SPLASH_BG }]}>
            <Text style={styles.wordmark}>
              <Text style={{ color: "#ffffff" }}>walk</Text>
              <Text style={{ color: palette.goldBright }}>UCF</Text>
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
