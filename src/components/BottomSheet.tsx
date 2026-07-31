import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import { useTheme } from "../theme";

export interface BottomSheetRef {
  /** Snap to a detent by index: 0 = peek, 1 = half, 2 = full. */
  snapTo: (index: number) => void;
  expand: () => void; // full
  half: () => void; // middle
  collapse: () => void; // peek
}

interface Props {
  topInset: number;
  bottomInset: number;
  /** Peek content (e.g. the search bar); always visible inside the drag area, but its
   * own touch targets keep working since the pan responder only claims deliberate drags. */
  header: React.ReactNode;
  /** Body content (the scrollable list); revealed as the sheet is dragged up. */
  children: React.ReactNode;
  onIndexChange?: (index: number) => void;
  /** Reports the measured peek (collapsed) height covered when minimized. */
  onPeekHeightChange?: (height: number) => void;
}

const TOP_GAP = 10; // gap between the status bar and a fully-open sheet
const HALF_RATIO = 0.52; // visible fraction of the screen at the middle detent
const PROJECTION = 110; // how far a fling is projected when choosing a detent

// Draggable bottom sheet using only RN core (Animated + PanResponder). A full-height card
// moved via `translateY`; releasing a drag springs to one of three detents by distance + velocity.
const BottomSheet = forwardRef<BottomSheetRef, Props>(function BottomSheet(
  { topInset, bottomInset, header, children, onIndexChange, onPeekHeightChange },
  ref,
) {
  const theme = useTheme();
  const [peekH, setPeekH] = useState(0);
  // The sheet's own laid-out height, rather than a height computed from
  // `Dimensions`: the "change" event and the layout pass arrive independently on
  // a rotation, so a Dimensions-derived height left the detents (and the map's
  // obscured-bottom margin) stale for a frame or more. Measuring the sheet also
  // keeps it correct in iPad Split View, where the app frame isn't the screen.
  const [fullHeight, setFullHeight] = useState(0);
  const ready = peekH > 0 && fullHeight > 0;

  useEffect(() => {
    if (peekH > 0) onPeekHeightChange?.(peekH);
  }, [peekH, onPeekHeightChange]);

  const translateY = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const startY = useRef(0);
  const didInit = useRef(false);

  const sheetTop = topInset + TOP_GAP;

  // Visible height of each detent, expressed as a translateY offset from the
  // fully-open position (index 0 = peek, 1 = half, 2 = full).
  const snaps = useMemo(() => {
    const winH = fullHeight + sheetTop;
    const peekTranslate = Math.max(fullHeight - peekH, 0);
    const halfTranslate = Math.min(
      Math.max(fullHeight - winH * HALF_RATIO, 0),
      peekTranslate,
    );
    return [peekTranslate, halfTranslate, 0];
  }, [fullHeight, peekH, sheetTop]);

  const animateTo = useCallback(
    (index: number, velocity = 0) => {
      const clamped = Math.max(0, Math.min(index, snaps.length - 1));
      indexRef.current = clamped;
      onIndexChange?.(clamped);
      Animated.spring(translateY, {
        toValue: snaps[clamped],
        velocity,
        useNativeDriver: true,
        damping: 24,
        stiffness: 260,
        mass: 0.75,
        restDisplacementThreshold: 0.4,
        restSpeedThreshold: 0.4,
      }).start();
    },
    [snaps, onIndexChange, translateY],
  );

  useImperativeHandle(
    ref,
    () => ({
      snapTo: (i: number) => animateTo(i),
      expand: () => animateTo(2),
      half: () => animateTo(1),
      collapse: () => animateTo(0),
    }),
    [animateTo],
  );

  useEffect(() => {
    if (!ready) return;
    if (!didInit.current) {
      // First time we know the geometry: slide up from off-screen.
      didInit.current = true;
      translateY.setValue(fullHeight);
      animateTo(0);
    } else {
      // Geometry changed later (peek height, rotation, insets) — settle instantly
      // on the current detent so the sheet never sticks mid-gap.
      translateY.stopAnimation();
      translateY.setValue(snaps[indexRef.current]);
    }
  }, [ready, snaps, fullHeight, animateTo, translateY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim only deliberate vertical drags, so taps still focus the search
        // field and horizontal gestures (text selection) are left alone.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderGrant: () => {
          translateY.stopAnimation((v: number) => {
            startY.current = v;
          });
        },
        onPanResponderMove: (_e, g) => {
          const next = Math.max(
            0,
            Math.min(startY.current + g.dy, snaps[0]),
          );
          translateY.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const projected = Math.max(
            0,
            Math.min(startY.current + g.dy + g.vy * PROJECTION, snaps[0]),
          );
          let best = 0;
          let bestDist = Infinity;
          snaps.forEach((s, i) => {
            const d = Math.abs(projected - s);
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          });
          animateTo(best, g.vy);
        },
      }),
    [snaps, animateTo, translateY],
  );

  return (
    <Animated.View
      // Anchored top-and-bottom so Yoga derives the height on every resize; the
      // measured value feeds the detents (see `fullHeight` above).
      style={[
        styles.sheet,
        {
          top: sheetTop,
          backgroundColor: theme.sheetBg,
          borderColor: theme.controlBorder,
          transform: [{ translateY }],
          opacity: ready ? 1 : 0,
        },
      ]}
      onLayout={(e: LayoutChangeEvent) =>
        setFullHeight(e.nativeEvent.layout.height)
      }
    >
      <View
        {...pan.panHandlers}
        // Padding below the peek content keeps the search bar above the home indicator;
        // the `14` floor gives breathing room on devices without a bottom inset.
        style={{ paddingBottom: Math.max(bottomInset, 14) }}
        onLayout={(e: LayoutChangeEvent) =>
          setPeekH(e.nativeEvent.layout.height)
        }
      >
        <View style={styles.grabberWrap}>
          <View
            style={[styles.grabber, { backgroundColor: theme.sheetHandle }]}
          />
        </View>
        {header}
      </View>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  grabberWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 6,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
  body: {
    flex: 1,
  },
});

export default BottomSheet;
