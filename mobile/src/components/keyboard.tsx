import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  View,
  type KeyboardEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/** Keeping what you type above the on-screen keyboard, on every platform.
 *
 * Phones draw edge to edge, so Android no longer shrinks the window for the
 * keyboard, and iOS never did. React Native's KeyboardAvoidingView measures
 * itself against its parent, which is wrong inside a sheet. So a box
 * measures where it really is on screen when the keyboard opens, pads its
 * bottom by however much the keyboard covers, and the scroll view inside
 * then scrolls the focused field into the space left. On the web the
 * browser reports the keyboard through window.visualViewport instead. */

type Overlap = { overlap: number; shown: number };

/** How many px of `ref`'s view the keyboard covers (0 while it's closed),
 * and a count that goes up each time it opens or moves. Padding the view's
 * own bottom doesn't move its frame, so measuring stays stable. */
export function useKeyboardOverlap(ref: RefObject<ComponentRef<typeof View> | null>): Overlap {
  const [state, setState] = useState<Overlap>({ overlap: 0, shown: 0 });

  useEffect(() => {
    const update = (overlap: number) => {
      overlap = Math.max(0, Math.round(overlap));
      setState((s) => (overlap === s.overlap && overlap === 0 ? s : { overlap, shown: overlap > 0 ? s.shown + 1 : s.shown }));
    };

    if (Platform.OS === "web") {
      const vv = typeof window === "undefined" ? undefined : window.visualViewport;
      if (!vv) return;
      const onResize = () => {
        const el = ref.current as unknown as HTMLElement | null;
        if (!el?.getBoundingClientRect) return;
        // Both in layout-viewport coordinates. Where the browser resizes
        // the page for the keyboard (Android Chrome with
        // interactive-widget=resizes-content), this is 0.
        update(el.getBoundingClientRect().bottom - (vv.offsetTop + vv.height));
      };
      vv.addEventListener("resize", onResize);
      return () => vv.removeEventListener("resize", onResize);
    }

    const ios = Platform.OS === "ios";
    const onShow = (e: KeyboardEvent) => {
      const keyboardTop = e.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _w, h) => update(y + h - keyboardTop));
    };
    const subs = [
      // iOS: before the keyboard slides in, so the two move together; and
      // again on every change (another field's keyboard, predictive bar).
      Keyboard.addListener(ios ? "keyboardWillChangeFrame" : "keyboardDidShow", onShow),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => update(0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [ref]);

  return state;
}

/** A view that keeps its content above the keyboard by padding its bottom. */
export function KeyboardBox({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const box = useRef<ComponentRef<typeof View>>(null);
  const { overlap } = useKeyboardOverlap(box);
  return (
    <View ref={box} style={[{ flex: 1 }, style, overlap > 0 ? { paddingBottom: overlap } : null]}>
      {children}
    </View>
  );
}

/** Space left between the focused field and the keyboard. */
const GAP = 24;

/** A ScrollView (filling its parent) that shrinks above the keyboard and
 * scrolls the focused field into what's left. */
export function KeyboardScrollView({ onScroll, ...props }: ScrollViewProps) {
  const box = useRef<ComponentRef<typeof View>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const { overlap, shown } = useKeyboardOverlap(box);

  useEffect(() => {
    if (shown > 0) revealFocused(scroll.current, offset.current);
  }, [shown]);

  return (
    <View ref={box} style={[{ flex: 1 }, overlap > 0 ? { paddingBottom: overlap } : null]}>
      <ScrollView
        ref={scroll}
        scrollEventThrottle={16}
        {...props}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
      />
    </View>
  );
}

/** Scrolls `scroll` (now at `offset`) so the focused field sits GAP above
 * its bottom edge, if it doesn't already show. */
function revealFocused(scroll: ComponentRef<typeof ScrollView> | null, offset: number) {
  if (Platform.OS === "web") {
    const el = typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return;
  }
  const input = TextInput.State.currentlyFocusedInput();
  if (!input || !scroll) return;
  input.measureInWindow((_ix, iy, _iw, ih) => {
    scroll.measureInWindow((_sx, sy, _sw, sh) => {
      const bottom = sy + sh - GAP;
      const top = sy + GAP;
      if (iy + ih > bottom) scroll.scrollTo({ y: offset + Math.min(iy + ih - bottom, iy - top), animated: true });
      else if (iy < top) scroll.scrollTo({ y: Math.max(0, offset - (top - iy)), animated: true });
    });
  });
}
