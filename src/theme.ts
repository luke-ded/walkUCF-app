import React, { createContext, useContext } from "react";

/**
 * Color palette lifted from the web app's Tailwind classes. The web app
 * expresses light/dark through `dark:` variants; in React Native there is no
 * CSS cascade, so the active theme is resolved here from a `dark` boolean
 * provided via ThemeContext.
 */
export const palette = {
  gold: "#a48100", // primary in light mode
  goldBright: "#ffca09", // primary in dark mode
  goldAccent: "#ffe68c",
  textLight: "#404040", // neutral-700
  textDark: "#e5e5e5", // neutral-200
  neutral600: "#525252",
  neutral300: "#d4d4d4",
  red: "#ef4444",
  white: "#ffffff",
  black: "#000000",
};

/** Permit-type chip colors, matching the web app. */
export function permitColor(permit: string): string {
  switch (permit) {
    case "Student/General - D":
      return "#00a651";
    case "Employee - E":
      return "#ed1d24";
    case "Resident - R":
      return "#f47721";
    case "Knights Plaza - KP":
      return "#bd1b8d";
    case "Lake Claire - LC":
      return "#b3874d";
    default:
      return "#6b7280";
  }
}

export interface Theme {
  dark: boolean;
  primary: string; // gold border / accent
  text: string;
  subText: string;
  accent: string;
  screenBg: string;
  navBg: string;
  panelBg: string;
  panelSolid: string;
  inputBg: string;
  overlay: string;
  selectedBg: string; // highlighted toggle button
}

export function buildTheme(dark: boolean): Theme {
  return {
    dark,
    primary: dark ? palette.goldBright : palette.gold,
    text: dark ? palette.textDark : palette.textLight,
    subText: dark ? palette.neutral300 : palette.neutral600,
    accent: palette.goldAccent,
    screenBg: dark ? "#141414" : "#d6d4d4",
    navBg: "rgba(0,0,0,0.85)",
    panelBg: dark ? "rgba(0,0,0,0.40)" : "rgba(255,255,255,0.60)",
    panelSolid: dark ? "rgba(0,0,0,0.80)" : "rgba(214,212,212,0.92)",
    inputBg: dark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.70)",
    overlay: "rgba(0,0,0,0.5)",
    selectedBg: dark ? "rgba(255,202,9,0.50)" : "rgba(255,202,9,0.50)",
  };
}

interface ThemeContextValue {
  dark: boolean;
  toggleDark: () => void;
  theme: Theme;
}

export const ThemeContext = createContext<ThemeContextValue>({
  dark: true,
  toggleDark: () => {},
  theme: buildTheme(true),
});

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemeControls(): ThemeContextValue {
  return useContext(ThemeContext);
}
