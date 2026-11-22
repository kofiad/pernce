import { Platform, StyleSheet, type PressableStateCallbackType, type ViewStyle } from "react-native";
import { FONT, GUTTER, radius, type Palette } from "../../lib/theme";

/** Shared styles for the UI building blocks: the `text` and `styles` StyleSheets, hover helpers and small shared constants. */

/** On the web, react-native-web also reports the pointer: `hovered`. */
export const isHovered = (state: PressableStateCallbackType) => !!(state as { hovered?: boolean }).hovered;

/** The --hover tint, laid over whatever the pressable already draws (a
 * plate, a row, a chip) so it works on every surface. Never on native. */
export const hoverTint = (c: Palette, state: PressableStateCallbackType): ViewStyle | null =>
  isHovered(state) ? { boxShadow: `inset 0 0 0 9999px ${c.hover}` } : null;

/** Rows on the web: the hover tint gets 12px of room either side, rounded,
 * without moving the row's content. */
export const webRow: ViewStyle | null = Platform.OS === "web" ? { marginHorizontal: -12, paddingHorizontal: 12, borderRadius: radius.md } : null;

/** The floating tab dock's height (.tabbar nav, and the add button). */
export const DOCK_HEIGHT = 64;

/** The type scale (Inter; the artboard's Foundations → Type). */
export const text = StyleSheet.create({
  displayLg: { fontFamily: FONT["500"], fontSize: 48, lineHeight: 58, letterSpacing: -0.48 },
  display: { fontFamily: FONT["500"], fontSize: 40, lineHeight: 48, letterSpacing: -0.4 },
  title: { fontFamily: FONT["500"], fontSize: 32, lineHeight: 38, letterSpacing: -0.32 },
  headingMd: { fontFamily: FONT["500"], fontSize: 24, lineHeight: 32, letterSpacing: 0 },
  heading: { fontFamily: FONT["500"], fontSize: 20, lineHeight: 28, letterSpacing: 0 },
  bodyLg: { fontFamily: FONT["400"], fontSize: 18, lineHeight: 28, letterSpacing: -0.09 },
  body: { fontFamily: FONT["400"], fontSize: 16, lineHeight: 24, letterSpacing: 0.24 },
  bodyBold: { fontFamily: FONT["600"], fontSize: 16, lineHeight: 24, letterSpacing: 0.16 },
  bodySm: { fontFamily: FONT["400"], fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  label: { fontFamily: FONT["600"], fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: FONT["400"], fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  /** .tx-s */
  sub: { fontFamily: FONT["400"], fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  /** .tx-n */
  rowTitle: { fontFamily: FONT["500"], fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  /** .li */
  row: { fontFamily: FONT["400"], fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  /** .tx-a */
  amount: { fontFamily: FONT["600"], fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  fieldLabel: { fontFamily: FONT["600"], fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  groupLabel: { fontFamily: FONT["600"], fontSize: 12, lineHeight: 17, letterSpacing: 0.4 },
  navTitle: { fontFamily: FONT["600"], fontSize: 17, lineHeight: 24, letterSpacing: 0 },
  avatar: { fontFamily: FONT["600"], color: "#ffffff", letterSpacing: 0 },
  chip: { fontFamily: FONT["600"], fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  badge: { fontFamily: FONT["400"], fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  seg: { fontFamily: FONT["600"], fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  /** No lineHeight: iOS misplaces TextInput text with one. */
  input: { flex: 1, fontFamily: FONT["400"], fontSize: 16, letterSpacing: 0.24, padding: 0 },
  button: { fontFamily: FONT["600"], fontSize: 16, lineHeight: 24, letterSpacing: 0.24 },
  buttonSmall: { fontFamily: FONT["600"], fontSize: 14, lineHeight: 20, letterSpacing: 0 },
});

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  columns: { flexDirection: "row", alignItems: "stretch" },
  dialogBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { maxWidth: "100%", maxHeight: "88%", borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  dialogHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 20, paddingRight: 20, paddingLeft: 28, paddingBottom: 4 },
  dialogBody: { flexGrow: 0, flexShrink: 1 },
  dialogFooter: { borderTopWidth: 1, paddingTop: 16, paddingHorizontal: 28, paddingBottom: 24 },
  dialogActions: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  num: { fontVariant: ["tabular-nums"] },
  content: { paddingHorizontal: GUTTER },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  inline: { flexDirection: "row", alignItems: "center" },
  grab: { width: 36, height: 5, borderRadius: 3, opacity: 0.5, alignSelf: "center", marginTop: 8 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 8,
    paddingLeft: 20,
  },
  navh: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 52, marginHorizontal: -8, marginBottom: 4 },
  navRight: { minWidth: 44, flexDirection: "row", justifyContent: "flex-end" },
  pageHeader: { marginTop: 8, marginBottom: 20 },
  pageHeaderWide: { minHeight: 48, marginBottom: 28 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 20 },
  group: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 16 },
  li: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  avatar: { borderRadius: radius.full, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  iconButton: { borderRadius: radius.full, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    flexShrink: 0,
  },
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  hscroll: { marginHorizontal: -GUTTER, flexGrow: 0 },
  hscrollContent: { paddingHorizontal: GUTTER },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 8 },
  rowRight: { alignItems: "flex-end", flexShrink: 0 },
  progressTrack: { height: 8, borderRadius: radius.full, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radius.full },
  button: {
    height: 48,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonSmall: { height: 36, paddingHorizontal: 16 },
  field: { marginBottom: 20 },
  input: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16 },
  seg: { flexDirection: "row", borderRadius: radius.full, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  toggle: { width: 51, height: 31, borderRadius: radius.full, flexShrink: 0 },
  knob: { position: "absolute", top: 3, width: 25, height: 25, borderRadius: 13 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 48, paddingHorizontal: 24 },
  ring: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  alertBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 40 },
  alertBox: { width: "100%", maxWidth: 400, borderRadius: radius.lg, borderWidth: 1, padding: 24 },
});

