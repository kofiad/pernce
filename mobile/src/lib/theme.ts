import { colors } from "@pernce/core";
import { useSyncExternalStore } from "react";
import { Appearance, Platform, useColorScheme } from "react-native";
import type { AppearancePref } from "../data/preferences";

/** Semantic roles from the artboard's `.t-dark` / `.t-light` blocks
 * (docs/design/pernce-artboard.html, Foundations → Mode mapping). Every
 * screen is drawn once against these; the system appearance picks the
 * mode, unless Settings → Appearance overrides it (applyAppearance). Keys mirror the artboard's CSS variables. */
export type Palette = { [K in Exclude<keyof typeof dark, "scheme">]: string } & { scheme: "dark" | "light" };

const dark = {
  /** --bg */
  canvas: colors["canvas-dark"],
  /** --bg-2: alert boxes. */
  canvas2: colors["surface-elevated"],
  card: colors["surface-elevated"],
  cardBorder: "transparent",
  inset: colors["surface-deep"],
  text: colors["on-dark"],
  mute: colors["on-dark-mute"],
  stone: colors.stone,
  divider: colors["divider-soft"],
  /** --hair */
  hairline: colors["hairline-dark"],
  chip: colors["surface-tint"],
  chipText: colors["on-dark"],
  chipActive: colors["canvas-light"],
  chipActiveText: colors.ink,
  /** --btn / --btn-t */
  buttonBg: colors["canvas-light"],
  buttonText: colors["canvas-dark"],
  /** --out */
  outline: colors["on-dark"],
  /** --soft / --soft-t: icon buttons and secondary buttons. */
  soft: colors["surface-tint"],
  softText: colors["on-dark"],
  field: colors["surface-elevated"],
  fieldBorder: colors["hairline-dark"],
  placeholder: colors.stone,
  track: "rgba(255,255,255,0.1)",
  /** --pos / --neg: dots, hairlines and fills. */
  positive: colors["accent-light-green"],
  negative: colors["accent-danger"],
  /** --pos-t / --neg-t: text, lifted for AA on black. */
  positiveText: "#5fb04a",
  negativeText: "#ff6f6f",
  warning: colors["accent-warning"],
  link: "#5c9df0",
  /** --brand: active tab icon. */
  brand: colors["primary-bright"],
  /** --sheet */
  sheet: colors["canvas-dark"],
  grid: "rgba(255,255,255,0.08)",
  mutedBar: colors.charcoal,
  /** --hover: a tint over whatever is under the pointer (web). */
  hover: "rgba(255,255,255,0.06)",
  primary: colors.primary,
  onPrimary: colors["on-primary"],
  scheme: "dark" as const,
};

const light: Palette = {
  canvas: colors["canvas-light"],
  canvas2: colors["surface-soft"],
  card: colors["canvas-light"],
  cardBorder: colors["hairline-light"],
  inset: colors["surface-soft"],
  text: colors.ink,
  mute: colors.mute,
  stone: colors.ash,
  divider: colors["hairline-light"],
  hairline: colors["hairline-light"],
  chip: colors["surface-soft"],
  chipText: colors.ink,
  chipActive: colors.ink,
  chipActiveText: colors["canvas-light"],
  buttonBg: colors["canvas-dark"],
  buttonText: colors["canvas-light"],
  outline: colors.ink,
  soft: colors["surface-soft"],
  softText: colors.ink,
  field: colors["canvas-light"],
  fieldBorder: colors["hairline-light"],
  placeholder: colors.stone,
  track: "rgba(0,0,0,0.08)",
  positive: colors["accent-light-green"],
  negative: colors["accent-danger"],
  positiveText: colors["accent-green-text"],
  negativeText: colors["accent-deep-red"],
  warning: colors["accent-warning"],
  link: colors["accent-blue-link"],
  brand: colors.primary,
  sheet: colors["canvas-light"],
  grid: colors["hairline-light"],
  mutedBar: colors.faint,
  hover: "rgba(0,0,0,0.04)",
  primary: colors.primary,
  onPrimary: colors["on-primary"],
  scheme: "light",
};

// The web has no Appearance.setColorScheme, so there the override is kept
// here and useTheme reads it ahead of the browser's scheme.
let webOverride: "light" | "dark" | null = null;
const webListeners = new Set<() => void>();
const subscribeWebOverride = (listener: () => void) => {
  webListeners.add(listener);
  return () => webListeners.delete(listener);
};

export function useTheme(): { c: Palette } {
  const system = useColorScheme();
  const override = useSyncExternalStore(subscribeWebOverride, () => webOverride);
  return { c: (override ?? system) === "light" ? light : dark };
}

/** M23a: Light or Dark overrides the phone's appearance for the whole app,
 * native alerts and keyboards included; System hands it back. */
export function applyAppearance(pref: AppearancePref) {
  if (Platform.OS === "web") {
    webOverride = pref === "system" ? null : pref;
    webListeners.forEach((listener) => listener());
    return;
  }
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

/** The artboard's --r-* radii. */
export const radius = { sm: 8, md: 12, lg: 20, xl: 28, full: 9999 } as const;
export const space = { xxs: 4, xs: 6, sm: 8, md: 14, lg: 16, xl: 24, xxl: 32 } as const;
/** .pb side padding. */
export const GUTTER = 20;

/** Inter (and JetBrains Mono for keys), loaded in the root layout; React
 * Native needs one family per weight rather than fontWeight on a custom
 * font. */
export const FONT = {
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
  mono: "JetBrainsMono_500Medium",
} as const;
