import React from "react";
import {
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { palette, useTheme } from "../theme";

interface ChildProps {
  toggleAbout: (about: boolean) => void;
}

const About: React.FC<ChildProps> = ({ toggleAbout }) => {
  const theme = useTheme();

  function close() {
    toggleAbout(false);
  }

  const Link: React.FC<{ url: string; children: React.ReactNode }> = ({
    url,
    children,
  }) => (
    <Text
      style={[styles.link, { color: theme.primary }]}
      onPress={() => Linking.openURL(url)}
    >
      {children}
    </Text>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.cardBg, borderColor: theme.controlBorder },
          ]}
        >
          <View style={[styles.cardHeader, { borderBottomColor: theme.separator }]}>
            <Text style={[styles.title, { color: theme.text }]}>
              About This Project
            </Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              <Text style={styles.bold}>walkUCF</Text> is a UCF map perfect for
              finding the fastest way to class. It provides the best routes,
              comprehensive building abbreviations, and precise entrances.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              This project was created by{" "}
              <Link url="https://www.linkedin.com/in/luke-ded">Luke</Link>, a CS
              major at the University of Central Florida.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              Find the code for this project{" "}
              <Link url="https://github.com/luke-ded/walkUCF-app">here</Link>.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              Report bugs, issues, or missing map elements{" "}
              <Link url="https://forms.gle/XmwzZMkAw9f15xzs6">here</Link>
              {" "}or reach out to support@walkucf.com.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              Read the privacy policy{" "}
              <Link url="https://walkucf.com/privacy">here</Link>.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              Thanks for using <Text style={styles.bold}>walkUCF</Text>!
            </Text>
          </View>
          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary }]}
              onPress={close}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme.dark ? palette.textLight : palette.textDark },
                ]}
              >
                Close
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
    paddingTop: 18,
    paddingBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  cardBody: {
    padding: 20,
    paddingTop: 8,
    alignItems: "center",
  },
  paragraph: {
    textAlign: "center",
    marginTop: 12,
    fontSize: 15,
    lineHeight: 21,
  },
  bold: {
    fontWeight: "700",
  },
  link: {
    fontWeight: "600",
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

export default About;
