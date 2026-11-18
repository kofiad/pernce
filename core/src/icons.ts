/** Stroke icon set (24x24 viewBox, drawn with stroke="currentColor",
 * fill="none", round caps/joins), ported 1:1 from pernce-artboard.html.
 * Each value is the inner SVG markup of one icon. The web app renders
 * these as a sprite; the mobile app renders them with react-native-svg.
 * Category rows store the key (e.g. "cart") in their `icon` column. */
export const ICON_PATHS = {
  home: '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h4v-5.5h3V20h4a1 1 0 0 0 1-1v-9"/>',
  wallet: '<rect x="2.5" y="6" width="19" height="13" rx="3"/><path d="M2.5 10.5h19"/><path d="M15 15h4"/>',
  list: '<path d="M4 6h3M10.5 6H20M4 12h3M10.5 12H20M4 18h3M10.5 18H20"/>',
  pie: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l7 4"/>',
  bar: '<path d="M5 20V11M11.5 20V5M18 20v-8"/><path d="M2.5 20h19"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h5M13 17h7"/><circle cx="15" cy="7" r="2.1"/><circle cx="9" cy="17" r="2.1"/>',
  search: '<circle cx="10.3" cy="10.3" r="6.3"/><path d="M20 20l-4.6-4.6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  "chevron-right": '<path d="M9 5l7 7-7 7"/>',
  "chevron-left": '<path d="M15 5l-7 7 7 7"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  "arrow-up-right": '<path d="M6 17 17 6M9 6h8v8"/>',
  "arrow-down-right": '<path d="M6 6l11 11M17 6v11H6"/>',
  filter: '<path d="M4 6h16M7.5 12h9M10.5 18h3"/>',
  swap: '<path d="M4 8h13M13.5 4 17 8l-3.5 4"/><path d="M20 16H7M10.5 12 7 16l3.5 4"/>',
  food: '<path d="M7.5 3v6a1.6 1.6 0 0 0 3.2 0V3M9.1 9v12M16.5 3c2.1 1.3 2.1 5.6 0 7.7l-1 .9V21"/>',
  car: '<path d="M4 16.5 5.4 11a2 2 0 0 1 1.9-1.5h9.4a2 2 0 0 1 1.9 1.5l1.4 5.5"/><rect x="3" y="16.5" width="18" height="4" rx="1.6"/><circle cx="7.5" cy="20.3" r="1.3"/><circle cx="16.5" cy="20.3" r="1.3"/>',
  bag: '<path d="M6.2 8h11.6l-1 12.5H7.2L6.2 8z"/><path d="M9 8V6.2a3 3 0 0 1 6 0V8"/>',
  bolt: '<path d="M13 2 4.5 14h6l-1 8 9-12h-6l1-8z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.3 15.5 12 10 15.7V8.3z"/>',
  heart: '<path d="M12 20s-7.2-4.5-9.6-9.1A5 5 0 0 1 12 6a5 5 0 0 1 9.6 4.9C19.2 15.5 12 20 12 20z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.6 14.8c0 1.3 1.1 1.9 2.4 1.9s2.4-.6 2.4-1.8c0-1.2-1-1.6-2.4-2-1.4-.4-2.4-.8-2.4-2 0-1.1 1.1-1.7 2.4-1.7s2.3.5 2.3 1.6"/>',
  more: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 12v4"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0"/><path d="M12 19.5v.01"/>',
  cart: '<path d="M2.5 4h2.6l2.3 11h10.8l2.1-8H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  wrench: '<path d="M14.5 3.5a5 5 0 0 0-4.8 6.6L3.5 16.3a2 2 0 0 0 2.8 2.8l6.2-6.2a5 5 0 0 0 6.6-4.8l-3 3-2.8-.7-.7-2.8 3-3a5 5 0 0 0-1.1-.1z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  book: '<path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v14c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-14c-3.8 0-6.3.5-8 2z"/><path d="M12 6.5v14"/>',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 14.5h4"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.6c1.8.6 3.1 2.3 3.5 4.9"/>',
  receipt: '<path d="M6 3h12v18l-2.4-1.6L13.2 21l-2.4-1.6L8.4 21 6 19.4V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  repeat: '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M16 3l3 3-3 3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5M8 21l-3-3 3-3"/>',
  sparkle: '<path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.2 10.2 12.6 4.5 10.8 10.2 9 12 3.5z"/><path d="M18.5 16v4M16.5 18h4"/>',
  dumbbell: '<path d="M8 12h8"/><rect x="4.5" y="7.5" width="3.5" height="9" rx="1.2"/><rect x="16" y="7.5" width="3.5" height="9" rx="1.2"/><path d="M2.5 10.5v3M21.5 10.5v3"/>',
  plane: '<path d="M21 4 3 11l7 2.5L12.5 21 21 4z"/><path d="M10 13.5 21 4"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M12 8.5V21"/><path d="M12 8.5C10.5 5 7 4.5 7 6.8S10 8.5 12 8.5zM12 8.5c1.5-3.5 5-4 5-1.7S14 8.5 12 8.5z"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.2"/><path d="M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18M11 13v1.5h2V13"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4.5v1.5A3 3 0 0 0 8 10.5M16 6h3.5v1.5a3 3 0 0 1-3.5 3M12 13v4M9.5 17h5M8.5 20.5h7"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.6"/><path d="M2.5 18.5h19"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5 19 9M14 9l2 2"/>',
  trend: '<path d="M3 17.5l6-6 4 4 8-8"/><path d="M15.5 7.5H21V13"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0H3z"/><path d="M12 12v6.5a2 2 0 0 1-4 0M12 3v.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z"/>',
  refund: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 19h16"/>',
  upload: '<path d="M12 20V8M7 13l5-5 5 5"/><path d="M4 19h16"/>',
  check: '<path d="M5 12.5 9.5 17 19 7"/>',
  "log-out": '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 16l4-4-4-4M20 12H9"/>',
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICON_PATHS;

/** Icons offered when picking a category icon (everything that reads as a
 * thing you spend on or earn from, not UI chrome). */
export const CATEGORY_ICONS = [
  "home", "bolt", "wifi", "cart", "car", "wrench", "heart", "shield", "book", "card", "users", "receipt",
  "food", "bag", "play", "repeat", "sparkle", "dumbbell", "plane", "gift", "more", "briefcase", "trophy",
  "laptop", "store", "key", "trend", "umbrella", "globe", "refund", "coin", "wallet", "calendar",
] as const satisfies readonly IconName[];
