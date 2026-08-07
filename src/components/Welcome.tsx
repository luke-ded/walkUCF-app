import React from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MODAL_ORIENTATIONS } from "../orientation";
import { palette, useTheme } from "../theme";

interface ChildProps {
  onDismiss: () => void;
}

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  {
    icon: "search",
    text: "Search any building by name or abbreviation, then add it as a stop.",
  },
  {
    icon: "walk",
    text: "Get the fastest walking route, with precise entrances and multiple stops.",
  },
  {
    icon: "options",
    text: "Toggle buildings, grass, parking lots, and more to shape the route.",
  },
  {
    icon: "location",
    text: "Share your location to see where you are on campus. It never leaves your device.",
  },
];

// Shown once, on the very first launch after install. Dismissing it is what
// kicks off the location permission request, so the system prompt doesn't stack
// on top of this card.
const Welcome: React.FC<ChildProps> = ({ onDismiss }) => {
  const theme = useTheme();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      supportedOrientations={MODAL_ORIENTATIONS}
      onRequestClose={onDismiss}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.cardBg, borderColor: theme.controlBorder },
          ]}
        >
          <View style={[styles.cardHeader, { borderBottomColor: theme.separator }]}>
            <Text style={[styles.welcome, { color: theme.secondaryText }]}>
              Welcome to
            </Text>
            <Text style={styles.wordmark}>
              <Text style={{ color: theme.text }}>walk</Text>
              <Text style={{ color: theme.primary }}>UCF</Text>
            </Text>
          </View>
          <View style={styles.cardBody}>
            {FEATURES.map(({ icon, text }) => (
              <View key={icon} style={styles.featureRow}>
                <View style={[styles.iconWell, { backgroundColor: theme.fillBg }]}>
                  <Ionicons name={icon} size={20} color={theme.primary} />
                </View>
                <Text style={[styles.featureText, { color: theme.text }]}>
                  {text}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={onDismiss}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme.dark ? palette.textLight : palette.textDark },
                ]}
              >
                Get Started
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
    paddingTop: 22,
    paddingBottom: 16,
  },
  welcome: {
    fontSize: 15,
    fontWeight: "500",
  },
  wordmark: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  cardBody: {
    padding: 20,
    gap: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  cardFooter: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  button: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

export default Welcome;
