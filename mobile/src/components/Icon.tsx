import { ICON_PATHS, type IconName } from "@pernce/core";
import { memo } from "react";
import { SvgXml } from "react-native-svg";

/** The artboard's own symbols (pernce-artboard.html <defs>), under core's
 * names where core has the same icon. They win over core's paths so the
 * app draws what the artboard draws; anything else (category icons like
 * "cart") comes from core. The artboard's three-dot "more" is "dots" here,
 * since core's "more" is a stored category icon. */
const ARTBOARD: Record<string, string> = {
  home: '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h4v-5.5h3V20h4a1 1 0 0 0 1-1v-9"/>',
  wallet: '<rect x="2.5" y="6" width="19" height="13" rx="3"/><path d="M2.5 10.5h19M15 15h4"/>',
  list: '<path d="M4 6h3M10.5 6H20M4 12h3M10.5 12H20M4 18h3M10.5 18H20"/>',
  pie: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l7 4"/>',
  bar: '<path d="M5 20V11M11.5 20V5M18 20v-8M2.5 20h19"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="10.3" cy="10.3" r="6.3"/><path d="M20 20l-4.6-4.6"/>',
  filter: '<path d="M4 6h16M7.5 12h9M10.5 18h3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  "chevron-right": '<path d="M9 5l7 7-7 7"/>',
  "chevron-left": '<path d="M15 5l-7 7 7 7"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  "arrow-up-right": '<path d="M6 17 17 6M9 6h8v8"/>',
  "arrow-down-left": '<path d="M17 6 6 17M6 9v8h8"/>',
  swap: '<path d="M4 8h13M13.5 4 17 8l-3.5 4M20 16H7M10.5 12 7 16l3.5 4"/>',
  food: '<path d="M7.5 3v6a1.6 1.6 0 0 0 3.2 0V3M9.1 9v12M16.5 3c2.1 1.3 2.1 5.6 0 7.7l-1 .9V21"/>',
  car: '<path d="M4 16.5 5.4 11a2 2 0 0 1 1.9-1.5h9.4a2 2 0 0 1 1.9 1.5l1.4 5.5"/><rect x="3" y="16.5" width="18" height="4" rx="1.6"/>',
  bag: '<path d="M6.2 8h11.6l-1 12.5H7.2L6.2 8z"/><path d="M9 8V6.2a3 3 0 0 1 6 0V8"/>',
  bolt: '<path d="M13 2 4.5 14h6l-1 8 9-12h-6l1-8z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.3 15.5 12 10 15.7V8.3z"/>',
  heart: '<path d="M12 20s-7.2-4.5-9.6-9.1A5 5 0 0 1 12 6a5 5 0 0 1 9.6 4.9C19.2 15.5 12 20 12 20z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.6 14.8c0 1.3 1.1 1.9 2.4 1.9s2.4-.6 2.4-1.8c0-1.2-1-1.6-2.4-2-1.4-.4-2.4-.8-2.4-2 0-1.1 1.1-1.7 2.4-1.7s2.3.5 2.3 1.6"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 16c1.5 1 3.5 1 5 0"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-3.5M4 5v4h4M4 13a8 8 0 0 0 14.7 3.5M20 19v-4h-4"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
  upload: '<path d="M12 15.5V4.5M7 9l5-5 5 5M4.5 20h15"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.2 6.2a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M18 5l2 2"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v9.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dots: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  "log-out": '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16l4-4-4-4M14 12H4"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.2"/>',
  file: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 13h6M9 16.5h6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  mode: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  lang: '<path d="M3.5 6h10M8.5 3.5V6M6 6c.8 3 2.8 5.4 5.5 6.6M11 6c-.8 3.2-3 5.8-6.5 7.2M12.5 20.5l4-9 4 9M13.8 17.5h5.4"/>',
};

/** The artboard's .i sizes: default 20, s 16, xs 13, l 28, xl 40, each
 * with its own stroke width. */
export const ICON_SIZE = {
  md: { size: 20, strokeWidth: 1.8 },
  s: { size: 16, strokeWidth: 1.9 },
  xs: { size: 13, strokeWidth: 2.1 },
  l: { size: 28, strokeWidth: 1.6 },
  xl: { size: 40, strokeWidth: 1.4 },
} as const;
export type IconSize = keyof typeof ICON_SIZE;

export const Icon = memo(function Icon({
  name,
  color,
  variant = "md",
  size,
  strokeWidth,
}: {
  name: string;
  color: string;
  variant?: IconSize;
  size?: number;
  strokeWidth?: number;
}) {
  const inner = ARTBOARD[name] ?? ICON_PATHS[name as IconName] ?? ICON_PATHS.more;
  const v = ICON_SIZE[variant];
  const px = size ?? v.size;
  const xml = `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth ?? v.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return <SvgXml xml={xml} width={px} height={px} color={color} />;
});
