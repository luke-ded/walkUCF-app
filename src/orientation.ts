import { ModalProps } from "react-native";

// RN's <Modal> defaults to `supportedOrientations: ["portrait"]`, so on iPad an
// open modal (About, Settings, Error, map style) refuses to follow a rotation —
// it stays portrait over a rotated app until dismissed. Every modal in the app
// spreads this instead.
export const MODAL_ORIENTATIONS: ModalProps["supportedOrientations"] = [
  "portrait",
  "portrait-upside-down",
  "landscape",
];
