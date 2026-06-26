import React, { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import NavBar from "./components/NavBar";
import MapBox from "./components/MapBox";
import Search from "./components/Search";
import RouteList from "./components/RouteList";
import About from "./components/About";
import ErrorModal from "./components/Error";
import Settings from "./components/Settings";
import { localStorage } from "./storage";
import { requestLocationPermission } from "./location";
import { useTheme } from "./theme";
import { Item } from "./types";

function HomePage() {
  const theme = useTheme();
  const [count, setCount] = useState(0);
  const [about, toggleAbout] = useState(false);
  const [error, toggleError] = useState(false);
  const [settings, toggleSettings] = useState(false);
  const [stops, setStops] = useState<Item[]>([]);

  var settingsData = localStorage.getItem("settings");
  if (settingsData == null || settingsData == undefined) {
    localStorage.setItem(
      "settings",
      JSON.stringify({
        units: "imperial",
        walkSpeed: 3,
        saveRoute: true,
        showLocation: true,
      }),
    );
  }

  var distanceData = localStorage.getItem("graphData");
  if (distanceData == null || distanceData == undefined) {
    localStorage.setItem(
      "graphData",
      JSON.stringify({ distanceMi: 0, distanceKm: 0 }),
    );
  }

  const triggerRerender = () => {
    setCount(count + 1);
  };

  async function checkGeolocationPermission() {
    try {
      const granted = await requestLocationPermission();
      localStorage.setItem("permissionStatus", JSON.stringify(granted));
    } catch (error) {
      console.error("Error querying permissions:", error);
    }
  }

  useEffect(() => {
    const alreadyChecked = localStorage.getItem("permissionChecked");

    if (!alreadyChecked) {
      checkGeolocationPermission();
      localStorage.setItem("permissionChecked", "true");
    }
  }, []);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.screenBg }]}>
      <NavBar
        toggleAbout={toggleAbout}
        about={about}
        toggleSettings={toggleSettings}
        settings={settings}
      />
      <View style={styles.body}>
        <View style={styles.mapPane}>
          <MapBox
            stops={stops}
            triggerRerender={triggerRerender}
            toggleError={toggleError}
          />
        </View>
        <View style={styles.searchPane}>
          <Search triggerRerender={triggerRerender} setStops={setStops} />
        </View>
        <View style={styles.routePane}>
          <RouteList
            triggerRerender={triggerRerender}
            setStops={setStops}
            stops={stops}
          />
        </View>
      </View>
      {about && <About toggleAbout={toggleAbout} />}
      {error && <ErrorModal toggleError={toggleError} />}
      {settings && (
        <Settings
          triggerRerender={triggerRerender}
          toggleSettings={toggleSettings}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  mapPane: {
    flex: 1.25,
  },
  searchPane: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  routePane: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
});

export default HomePage;
