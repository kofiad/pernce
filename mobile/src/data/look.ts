import { CATEGORY_ICONS, isColorValue } from "@pernce/core";

/** The look of an account, category, budget or the profile avatar: a
 * color (a token or a custom "#rrggbb", core isColorValue) and an icon.
 * Shared by local writes, backup import and rows pulled by sync. */

/** Every icon a row may store, in the order the icon sheet lists them:
 * core's category icons, then the profile's person. */
export const PICKABLE_ICONS: readonly string[] = [...CATEGORY_ICONS, "user"];

const ICONS = new Set(PICKABLE_ICONS);

export function isIcon(value: unknown): value is string {
  return typeof value === "string" && ICONS.has(value);
}

export function checkColor(value: string) {
  if (!isColorValue(value)) throw new Error(`Unknown color "${value}"`);
  return value;
}

export function checkIcon(value: string) {
  if (!isIcon(value)) throw new Error(`Unknown icon "${value}"`);
  return value;
}

/** For columns where null means "the default" (initials, the category's). */
export function checkIconOrNull(value: string | null | undefined) {
  return value === null || value === undefined ? null : checkIcon(value);
}

export function checkColorOrNull(value: string | null | undefined) {
  return value === null || value === undefined ? null : checkColor(value);
}

/* Custom colours (the colour wheel, M22a). Hue 0-360, saturation and
 * value (brightness) 0-1. */

export type HSV = { h: number; s: number; v: number };

/** "#rrggbb", lowercase, as core isColorValue expects. */
export function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToHsv(hex: string): HSV {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

/** "2F8F6B", "#2f8f6b " -> "#2f8f6b"; null if it isn't a 6-digit hex. */
export function parseHex(input: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

/** WCAG contrast of white on `hex`: avatars draw white icons and letters,
 * so under 3 is hard to read. */
export function whiteContrast(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => lin(x / 255));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/** A budget's colour and icon: its own, else its category's. */
export function budgetLook(
  budget: { color: string | null; icon: string | null } | null,
  category: { color: string; icon: string } | undefined,
) {
  return {
    color: budget?.color ?? category?.color ?? "stone",
    icon: budget?.icon ?? category?.icon ?? "more",
  };
}
