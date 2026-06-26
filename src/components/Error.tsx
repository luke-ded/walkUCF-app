import React from "react";
import {
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { palette, useTheme } from "../theme";

interface ChildProps {
  toggleError: (error: boolean) => void;
}

const ErrorModal: React.FC<ChildProps> = ({ toggleError }) => {
  const theme = useTheme();

  function close() {
    toggleError(false);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { borderColor: palette.red, backgroundColor: theme.panelSolid }]}>
          <View style={styles.cardBody}>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              Locations inaccessible to each other. Some locations or entrances
              could be inaccessible depending on your map options.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              If this is likely incorrect, please submit an issue report{" "}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL("https://forms.gle/XmwzZMkAw9f15xzs6")}
              >
                here
              </Text>{" "}
              with the names &amp; entrances of these two locations.
            </Text>
          </View>
          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={[styles.button, { borderColor: palette.red, backgroundColor: theme.inputBg }]}
              onPress={close}
            >
              <Text style={{ color: theme.text }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

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
    borderWidth: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  cardBody: {
    padding: 16,
    alignItems: "center",
  },
  paragraph: {
    textAlign: "center",
    marginTop: 12,
    fontSize: 15,
  },
  link: {
    fontWeight: "700",
    color: palette.red,
  },
  cardFooter: {
    alignItems: "center",
    paddingBottom: 20,
    marginTop: 8,
  },
  button: {
    height: 40,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ErrorModal;
