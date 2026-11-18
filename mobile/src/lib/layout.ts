import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { GUTTER } from "./theme";

/** The web app's breakpoints (pernce_design.md, Responsive Behavior).
 * Phones always get the phone layout: only a browser 768px or wider
 * switches to the rail (768–1023) or the sidebar (1024 and up). */
export type Nav = "dock" | "rail" | "side";

export const RAIL_WIDTH = 72;
export const SIDE_WIDTH = 240;
/** Wide pages stop growing here; settings-style pages at NARROW_MAX. */
export const PAGE_MAX = 1200;
export const NARROW_MAX = 720;
/** Two-column rows need this much content width, else they stack. */
const TWO_COLUMNS = 880;

export function navFor(width: number): Nav {
  if (Platform.OS !== "web" || width < 768) return "dock";
  return width < 1024 ? "rail" : "side";
}

export type Layout = {
  nav: Nav;
  /** The rail or the sidebar: wide pages, dialogs, the add popover. */
  wide: boolean;
  /** Page padding: 20 (phone), 32 (rail), 48 (sidebar). */
  pad: number;
  /** The page's content width. */
  content: number;
  /** Room for two columns side by side. */
  twoColumns: boolean;
};

export function useLayout(): Layout {
  const { width } = useWindowDimensions();
  const nav = navFor(width);
  const wide = nav !== "dock";
  const pad = nav === "side" ? 48 : nav === "rail" ? 32 : GUTTER;
  const navWidth = nav === "side" ? SIDE_WIDTH : nav === "rail" ? RAIL_WIDTH : 0;
  const content = Math.min(PAGE_MAX, width - navWidth - 2 * pad);
  return { nav, wide, pad, content, twoColumns: wide && content >= TWO_COLUMNS };
}

/** Web only: keyboard focus draws a 2px --brand ring 2px out, and only for
 * the keyboard (:focus-visible); inputs keep their own focused border. */
export function useFocusRing(brand: string) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent = `
[tabindex]:focus-visible, a:focus-visible { outline: 2px solid ${brand}; outline-offset: 2px; }
[tabindex]:focus:not(:focus-visible) { outline: none; }
input:focus, textarea:focus { outline: none; }
`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [brand]);
}
