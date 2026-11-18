/** Pernce color tokens, ported from docs/design/pernce_design.md (and the
 * artboard's `:root` block). Keys are the
 * same token names the database stores (e.g. an account's `color` is
 * "accent-teal"), so `colors[token]` resolves them on platforms without
 * CSS custom properties. Keep in sync with the design doc and the artboard. */
export const colors = {
  "primary": "#0b7a62",
  "primary-bright": "#14a37f",
  "primary-deep": "#085c4a",
  "on-primary": "#ffffff",
  "ink": "#161b1a",
  "body": "#1d2422",
  "charcoal": "#363e3c",
  "mute": "#4e5957",
  "ash": "#5b6563",
  "stone": "#8b9694",
  "faint": "#c7cecc",
  "on-dark": "#ffffff",
  "on-dark-mute": "rgba(255, 255, 255, 0.72)",
  "canvas-light": "#ffffff",
  "canvas-dark": "#000000",
  "surface-soft": "#f2f5f4",
  "surface-card": "#ffffff",
  "surface-deep": "#0a0c0c",
  "surface-elevated": "#151a19",
  "surface-tint": "rgba(255, 255, 255, 0.08)",
  "hairline-light": "#dde3e1",
  "hairline-dark": "rgba(255, 255, 255, 0.12)",
  "hairline-strong": "#161b1a",
  "divider-soft": "rgba(255, 255, 255, 0.06)",
  "accent-teal": "#0e8f8a",
  "accent-blue-link": "#2a63c7",
  "accent-light-blue": "#2b7fd4",
  "accent-light-green": "#3f8c2c",
  "accent-green-text": "#22661b",
  "accent-yellow": "#a68700",
  "accent-warning": "#df7a06",
  "accent-pink": "#d6325f",
  "accent-danger": "#d63a3a",
  "accent-deep-red": "#8f1b22",
  "accent-brown": "#8c6656",
  "accent-violet": "#7046cc",
  "accent-magenta": "#b8378a",
  "accent-lime": "#739a10",
  "accent-slate": "#5e6a7e",
  "accent-cyan": "#0f7f9c",
  "accent-coral": "#c9562a",
  "accent-plum": "#96399f",
  "accent-steel": "#3f5f8f",
  "link": "#2a63c7",
} as const;

export type ColorToken = keyof typeof colors;

const HEX = /^#[0-9a-f]{6}$/;

/** A color a row may store: a token name ("accent-teal") or a custom
 * color as lowercase "#rrggbb" (the mobile app's color wheel). */
export function isColorValue(value: unknown): value is string {
  return typeof value === "string" && (value in colors || HEX.test(value));
}

/** Resolves a stored color (a token name or "#rrggbb") to a concrete
 * color, falling back to `stone` for a token this build doesn't know. */
export function resolveColor(token: string): string {
  if (HEX.test(token)) return token;
  return (colors as Record<string, string>)[token] ?? colors.stone;
}
