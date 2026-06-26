import React from "react";
import {
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../theme";

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
        <View style={[styles.card, { borderColor: theme.primary, backgroundColor: theme.panelSolid }]}>
          <View style={[styles.cardHeader, { borderBottomColor: theme.primary }]}>
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
              <Link url="https://github.com/luke-ded/walkUCF">here</Link>.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              Report bugs, issues, or missing map elements{" "}
              <Link url="https://forms.gle/XmwzZMkAw9f15xzs6">here</Link>.
            </Text>
            <Text style={[styles.paragraph, { color: theme.text }]}>
              Thanks for using <Text style={styles.bold}>walkUCF</Text>!
            </Text>
          </View>
          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={[styles.button, { borderColor: theme.primary, backgroundColor: theme.inputBg }]}
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
  cardHeader: {
    alignItems: "center",
    borderBottomWidth: 2,
    paddingVertical: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  cardBody: {
    padding: 20,
    alignItems: "center",
  },
  paragraph: {
    textAlign: "center",
    marginTop: 12,
    fontSize: 15,
  },
  bold: {
    fontWeight: "700",
  },
  link: {
    fontWeight: "700",
  },
  cardFooter: {
    alignItems: "center",
    paddingBottom: 20,
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

export default About;
