import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
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

interface BottomSheetBody {
  /** Spread onto the sheet's scrollable body list. Scrolling is only enabled at the
   * full detent — below it a vertical drag belongs to the sheet, not the list. */
  scrollProps: {
    scrollEnabled: boolean;
    scrollEventThrottle: number;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  };
  /** Hold the gesture while an inner vertical drag (e.g. reordering a row) owns the
   * touch, so the sheet doesn't steal it. */
  setDragLock: (locked: boolean) => void;
}

const BottomSheetBodyContext = createContext<BottomSheetBody>({
  scrollProps: {
    scrollEnabled: true,
    scrollEventThrottle: 16,
    onScroll: () => {},
  },
  setDragLock: () => {},
});

/** Lets the sheet's body content cooperate with the sheet's drag gesture. */
export const useBottomSheetBody = () => useContext(BottomSheetBodyContext);

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
  // Body-list scroll offset and inner-gesture lock, both read from the pan responder
  // while deciding whether a drag belongs to the sheet or to the content.
  const scrollY = useRef(0);
  const dragLock = useRef(false);
  const [scrollEnabled, setScrollEnabled] = useState(false);

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
      // The body only scrolls once the sheet is fully open; at the smaller detents a
      // drag over the list moves the sheet instead.
      setScrollEnabled(clamped === snaps.length - 1);
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

  const pan = useMemo(() => {
    // The responder sits on the whole sheet, so a drag anywhere on it moves the sheet.
    // That makes it an ancestor of the body's list, and RN consults ancestors on every
    // move — so the same test has to run in both phases: capture, to take a drag away
    // from the list, and bubble, for everything outside it.
    const claim = (g: { dx: number; dy: number }) => {
      // An inner gesture (row reordering) already owns this touch.
      if (dragLock.current) return false;
      // Deliberate vertical drags only, so taps still focus the search field and
      // horizontal gestures (text selection) are left alone.
      const vertical =
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2;
      if (!vertical) return false;
      // Below the full detent the body can't scroll, so every drag is the sheet's.
      if (indexRef.current < snaps.length - 1) return true;
      // Fully open: the list scrolls, and only a pull-down from its top collapses.
      return g.dy > 0 && scrollY.current <= 1;
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => claim(g),
      onMoveShouldSetPanResponder: (_e, g) => claim(g),
      // Once the sheet owns the drag it keeps it; otherwise a list underneath could
      // take it back halfway through the movement.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // The body list is native-scrolled, so claiming the JS responder doesn't stop
        // it rubber-banding under the finger — freeze it for the rest of the gesture.
        setScrollEnabled(false);
        translateY.stopAnimation((v: number) => {
          startY.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const next = Math.max(0, Math.min(startY.current + g.dy, snaps[0]));
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
      // Interrupted (e.g. by a system gesture): settle back on the current detent so
      // the sheet doesn't stay parked mid-gap with scrolling still frozen.
      onPanResponderTerminate: () => animateTo(indexRef.current),
    });
  }, [snaps, animateTo, translateY]);

  const setDragLock = useCallback((locked: boolean) => {
    dragLock.current = locked;
  }, []);

  const bodyCtx = useMemo<BottomSheetBody>(
    () => ({
      scrollProps: {
        scrollEnabled,
        scrollEventThrottle: 16,
        onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        },
      },
      setDragLock,
    }),
    [scrollEnabled, setDragLock],
  );

  return (
    <Animated.View
      // The drag gesture lives here rather than on the peek header, so the sheet
      // follows a drag started anywhere on it.
      {...pan.panHandlers}
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
      <View style={styles.body}>
        <BottomSheetBodyContext.Provider value={bodyCtx}>
          {children}
        </BottomSheetBodyContext.Provider>
      </View>
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
