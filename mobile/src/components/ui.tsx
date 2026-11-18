import { initials, resolveColor } from "@pernce/core";
import { router, type Href } from "expo-router";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import type { Health } from "../lib/budgetHealth";
import { useT } from "../lib/i18n";
import { NARROW_MAX, PAGE_MAX, useLayout } from "../lib/layout";
import { FONT, GUTTER, radius, useTheme, type Palette } from "../lib/theme";
import { Icon, type IconSize } from "./Icon";
import { KeyboardBox, KeyboardScrollView } from "./keyboard";

/** Building blocks ported from docs/design/pernce-artboard.html. Each
 * component names the artboard class it reproduces. */

/** On the web, react-native-web also reports the pointer: `hovered`. */
export const isHovered = (state: PressableStateCallbackType) => !!(state as { hovered?: boolean }).hovered;

/** The --hover tint, laid over whatever the pressable already draws (a
 * plate, a row, a chip) so it works on every surface. Never on native. */
export const hoverTint = (c: Palette, state: PressableStateCallbackType): ViewStyle | null =>
  isHovered(state) ? { boxShadow: `inset 0 0 0 9999px ${c.hover}` } : null;

/** Rows on the web: the hover tint gets 12px of room either side, rounded,
 * without moving the row's content. */
const webRow: ViewStyle | null = Platform.OS === "web" ? { marginHorizontal: -12, paddingHorizontal: 12, borderRadius: radius.md } : null;

/** The floating tab dock's height (.tabbar nav, and the add button). */
export const DOCK_HEIGHT = 64;

/** How far the tab dock sits above the bottom edge. iOS: 30px, clear of
 * the home indicator (drawn 8px up, inside the inset). Android: 12px above
 * the navigation bar, whatever it is (a ~24px gesture handle or ~48px of
 * Back / Home / Recents buttons). No inset at all: 12px. */
export function useDockBottom() {
  const { bottom } = useSafeAreaInsets();
  if (bottom === 0) return 12;
  return Platform.OS === "ios" ? 30 : bottom + 12;
}

/** Bottom padding that lets a tab screen's last row scroll clear of the
 * dock, with a 26px gap (120px on iOS, as the artboard's .tabbed .pb). */
export function useTabClearance() {
  return useDockBottom() + DOCK_HEIGHT + 26;
}

/** A phone screen (.pb): 8px top, 20px sides, 40px bottom; tab screens
 * leave room for the tab dock. Content grows to fill the screen, so a block with
 * `marginTop: "auto"` sits at the bottom like the artboard's button stacks.
 *
 * `sheet` makes it a sheet (.sheetc): grab handle, title and close button,
 * then 12px above the content. */
export function Screen({
  children,
  scroll = true,
  edges,
  sheet,
  tabs = false,
  narrow,
  overlay,
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  /** The sheet's title (.sheeth). */
  sheet?: string;
  /** Scrolls clear of the floating tab dock. */
  tabs?: boolean;
  /** Wide screens: a settings-style page, centred at 720 (W12), or at
   * the width given. */
  narrow?: boolean | number;
  /** Absolutely positioned on top of the content, e.g. the FAB. */
  overlay?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const clearance = useTabClearance();
  const layout = useLayout();
  // Wide screens: a sheet is a dialog over the page it came from (W09), and
  // a page is padded and capped instead of phone-width.
  if (layout.wide && sheet) {
    return (
      <Dialog title={sheet} onClose={() => router.back()} scroll={scroll}>
        {children}
      </Dialog>
    );
  }
  if (layout.wide) {
    const page = (
      <View style={[styles.flexGrow, { width: "100%", maxWidth: typeof narrow === "number" ? narrow : narrow ? NARROW_MAX : PAGE_MAX }, narrow ? { alignSelf: "center" } : null, contentStyle]}>
        {children}
      </View>
    );
    const pad = { paddingHorizontal: layout.pad, paddingTop: layout.pad - 8, paddingBottom: 64 };
    return (
      <View style={[styles.flex, { backgroundColor: c.canvas }]}>
        {scroll ? (
          <ScrollView contentContainerStyle={[styles.flexGrow, pad]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
            {page}
          </ScrollView>
        ) : (
          <View style={[styles.flex, pad]}>{page}</View>
        )}
        {overlay}
      </View>
    );
  }
  const pad = [
    styles.content,
    { paddingTop: sheet ? 12 : 8, paddingBottom: tabs ? clearance : 40 },
    contentStyle,
  ];
  return (
    <SafeAreaView
      edges={edges ?? (sheet ? ["bottom"] : ["top", "bottom"])}
      style={[styles.flex, { backgroundColor: sheet ? c.sheet : c.canvas }]}
    >
      {sheet ? (
        <>
          <View style={[styles.grab, { backgroundColor: c.stone }]} />
          <SheetHeader title={sheet} />
        </>
      ) : null}
      {scroll ? (
        <KeyboardScrollView
          contentContainerStyle={[{ flexGrow: 1 }, pad]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </KeyboardScrollView>
      ) : (
        <KeyboardBox>
          <View style={[styles.flex, pad]}>{children}</View>
        </KeyboardBox>
      )}
      {overlay}
    </SafeAreaView>
  );
}

/** .sheeth: heading-md title and a 36px close button. */
export function SheetHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  const t = useT();
  return (
    <View style={styles.sheetHeader}>
      <T variant="headingMd" numberOfLines={1} style={styles.flexShrink}>
        {title}
      </T>
      <IconButton icon="x" size="sm" label={t.common.close} onPress={onClose ?? (() => router.back())} />
    </View>
  );
}

/** A footer slot: `Actions` inside a dialog hands its buttons up to the
 * dialog's pinned footer instead of drawing them in the scrolling body. */
type FooterSlot = { get: () => ReactNode; set: (n: ReactNode) => void; subscribe: (l: () => void) => () => void };
function createFooterSlot(): FooterSlot {
  let value: ReactNode = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (n) => {
      value = n;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
const DialogFooterContext = createContext<FooterSlot | null>(null);

function DialogFooter({ slot }: { slot: FooterSlot }) {
  const { c } = useTheme();
  const footer = useSyncExternalStore(slot.subscribe, slot.get);
  if (!footer) return null;
  return <View style={[styles.dialogFooter, { borderTopColor: c.divider }]}>{footer}</View>;
}

/** dlg(): a sheet on a wide screen (web from 768px, W09–W11). A centred
 * card over a 50% dim: forms 560 wide, choices 440, at most 88% of the
 * window tall. The body scrolls; `Actions` inside it become the pinned
 * footer. Esc, the close button or a click on the dim closes it, and the
 * browser keeps focus inside while it is open (react-native-web's Modal). */
export function Dialog({
  visible = true,
  title,
  onClose,
  size = "form",
  scroll = true,
  fill,
  children,
}: {
  visible?: boolean;
  title: string;
  onClose: () => void;
  size?: "form" | "choice";
  scroll?: boolean;
  /** Takes the full 88%, e.g. for a list that scrolls itself. */
  fill?: boolean;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const t = useT();
  const [slot] = useState(createFooterSlot);
  const body = { paddingHorizontal: 28, paddingTop: 16, paddingBottom: 24 };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t.common.close} tabIndex={-1} />
        <View
          accessibilityRole="none"
          aria-modal
          style={[
            styles.dialog,
            { width: size === "form" ? 560 : 440, backgroundColor: c.sheet, borderColor: c.hairline },
            fill ? { height: "88%" } : null,
          ]}
        >
          <View style={styles.dialogHeader}>
            <T variant="headingMd" numberOfLines={1} style={styles.flexShrink}>
              {title}
            </T>
            <IconButton icon="x" size="sm" label={t.common.close} onPress={onClose} />
          </View>
          <DialogFooterContext.Provider value={slot}>
            {scroll ? (
              <ScrollView style={styles.dialogBody} contentContainerStyle={body} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <View style={[body, fill ? styles.flex : null]}>{children}</View>
            )}
          </DialogFooterContext.Provider>
          <DialogFooter slot={slot} />
        </View>
      </View>
    </Modal>
  );
}

type TextVariant =
  | "displayLg"
  | "display"
  | "title"
  | "headingMd"
  | "heading"
  | "bodyLg"
  | "body"
  | "bodyBold"
  | "bodySm"
  | "label"
  | "caption"
  | "sub"
  | "rowTitle"
  | "row"
  | "amount"
  | "fieldLabel"
  | "groupLabel";

type Weight = keyof typeof FONT;

/** The type scale (.d-lg … .cap) plus the list classes (.tx-n, .tx-s,
 * .tx-a, .li, .fl-l, .lbl). `num` is the artboard's .num (tabular figures). */
export function T({
  children,
  variant = "body",
  color,
  weight,
  style,
  numberOfLines,
  align,
  num,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  /** Overrides the variant's weight (Inter needs one family per weight). */
  weight?: Weight;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: TextStyle["textAlign"];
  num?: boolean;
}) {
  const { c } = useTheme();
  const base =
    variant === "sub" || variant === "groupLabel" ? c.stone : variant === "fieldLabel" ? c.mute : c.text;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        text[variant],
        { color: color ?? base },
        weight ? { fontFamily: FONT[weight] } : null,
        align ? { textAlign: align } : null,
        num || variant === "amount" ? styles.num : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** .card (and .card.inset): 20px radius, 20px padding; a hairline in the
 * light mode. */
export function Card({
  children,
  style,
  onPress,
  inset,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  inset?: boolean;
}) {
  const { c } = useTheme();
  const look = inset
    ? { backgroundColor: c.inset, borderColor: "transparent" }
    : { backgroundColor: c.card, borderColor: c.cardBorder };
  if (!onPress) return <View style={[styles.card, look, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={(state) => [styles.card, look, { opacity: state.pressed ? 0.85 : 1 }, hoverTint(c, state), style]}>
      {children}
    </Pressable>
  );
}

/** .row: space-between, centered, 12px apart. */
export function Between({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.between, style]}>{children}</View>;
}

/** .rs: left-aligned with a 12px gap. */
export function Inline({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.inline, { gap }, style]}>{children}</View>;
}

const AVATAR = {
  xs: { px: 24, font: 10, icon: "s" },
  sm: { px: 36, font: 12, icon: "s" },
  md: { px: 42, font: 13, icon: "md" },
  lg: { px: 56, font: 18, icon: "md" },
} as const;

/** .av (42), .av.sm (36), .av.lg (56), .av.xs (24): a solid circle with
 * white initials or a white stroke icon. `ring` is .catc.on / .sw.on. */
export function Avatar({
  color,
  label,
  letters,
  icon,
  size = "md",
  iconVariant,
  ring,
}: {
  /** A color token ("accent-teal") or a literal color. */
  color: string;
  /** Shown as its initials ("MTN MoMo" -> "MM"). */
  label?: string;
  /** Shown as-is ("A"). */
  letters?: string;
  icon?: string;
  size?: keyof typeof AVATAR;
  iconVariant?: IconSize;
  ring?: boolean;
}) {
  const { c } = useTheme();
  const a = AVATAR[size];
  const bg = color.startsWith("#") || color.startsWith("rgb") ? color : resolveColor(color);
  return (
    <View
      style={[
        styles.avatar,
        { width: a.px, height: a.px, backgroundColor: bg },
        ring ? { boxShadow: `0 0 0 2px ${c.canvas}, 0 0 0 4px ${c.text}` } : null,
      ]}
    >
      {icon ? (
        <Icon name={icon} color="#ffffff" variant={iconVariant ?? a.icon} />
      ) : label || letters ? (
        <Text style={[text.avatar, { fontSize: a.font }]}>{letters ?? initials(label!)}</Text>
      ) : null}
    </View>
  );
}

/** .ib (44) / .ib.sm (36): a soft circle with an icon; `brand` is the
 * primary "+" and `ghost` the transparent back / more buttons. */
export function IconButton({
  icon,
  onPress,
  label,
  size = "md",
  px,
  variant = "soft",
  iconVariant,
  iconColor,
  disabled,
}: {
  icon: string;
  onPress?: () => void;
  label: string;
  size?: "md" | "sm";
  /** A bigger plate (.qa's 52, the 64/72 hero icons). */
  px?: number;
  variant?: "soft" | "brand" | "ghost" | "selected";
  iconVariant?: IconSize;
  iconColor?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const look = {
    soft: { bg: c.soft, fg: c.softText },
    brand: { bg: c.primary, fg: c.onPrimary },
    ghost: { bg: "transparent", fg: c.text },
    selected: { bg: c.chipActive, fg: c.chipActiveText },
  }[variant];
  const dim = px ?? (size === "sm" ? 36 : 44);
  const plate = { width: dim, height: dim, backgroundColor: look.bg };
  const glyph = <Icon name={icon} color={iconColor ?? look.fg} variant={iconVariant ?? (size === "sm" ? "s" : "md")} />;
  if (!onPress) {
    return (
      <View accessibilityLabel={label} style={[styles.iconButton, plate]}>
        {glyph}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={(state) => [styles.iconButton, plate, { opacity: disabled ? 0.4 : state.pressed ? 0.7 : isHovered(state) ? 0.88 : 1 }]}
    >
      {glyph}
    </Pressable>
  );
}

/** .navh: back button, 17px title, right slot. On a wide screen there is
 * no back button: a crumb back to `parent` sits over a heading-lg title
 * (W07), and without a parent (Settings, opened from the nav) just the
 * title. */
export function NavHeader({
  title = "",
  right,
  onBack,
  parent,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
  parent?: { label: string; href: Href };
}) {
  const t = useT();
  const { wide } = useLayout();
  if (wide) {
    return (
      <View style={{ marginBottom: 28 }}>
        {parent ? <Crumb parent={parent} title={title} onBack={onBack} /> : null}
        <Between style={{ minHeight: 48 }}>
          <T variant="title" numberOfLines={1} style={styles.flexShrink}>
            {title}
          </T>
          {right ? <Inline gap={10}>{right}</Inline> : null}
        </Between>
      </View>
    );
  }
  return (
    <View style={styles.navh}>
      <IconButton icon="chevron-left" size="sm" variant="ghost" iconVariant="md" label={t.common.back} onPress={onBack ?? (() => router.back())} />
      <T style={text.navTitle} numberOfLines={1}>
        {title}
      </T>
      <View style={styles.navRight}>{right}</View>
    </View>
  );
}

/** Wide screens: "Accounts › MTN MoMo", the parent a link back to it. */
export function Crumb({ parent, title, onBack }: { parent: { label: string; href: Href }; title: string; onBack?: () => void }) {
  const { c } = useTheme();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.navigate(parent.href)));
  return (
    <Inline gap={6} style={{ marginBottom: 8 }}>
      <Pressable accessibilityRole="link" onPress={back} style={(state) => [{ borderRadius: radius.sm }, hoverTint(c, state)]}>
        <T variant="bodySm" weight="500" color={c.link}>
          {parent.label}
        </T>
      </Pressable>
      <Icon name="chevron-right" color={c.stone} variant="xs" />
      <T variant="bodySm" color={c.stone} numberOfLines={1} style={styles.flexShrink}>
        {title}
      </T>
    </Inline>
  );
}

/** pageh: a heading-lg title with actions on the right. Below the wide
 * breakpoint the last action is a gear into Settings, so every tab has
 * one; the rail and the sidebar cover wide screens. */
export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  const t = useT();
  const { wide } = useLayout();
  return (
    <Between style={wide ? styles.pageHeaderWide : styles.pageHeader}>
      <T variant="title" numberOfLines={1} style={styles.flexShrink}>
        {title}
      </T>
      {right || !wide ? (
        <Inline gap={wide ? 10 : 8}>
          {right}
          {wide ? null : (
            <IconButton icon="gear" size="sm" variant="soft" label={t.common.settings} onPress={() => router.push("/settings")} />
          )}
        </Inline>
      ) : null}
    </Between>
  );
}

/** "Accounts … See all ›" */
export function SectionHead({ title, onSeeAll, style }: { title: string; onSeeAll?: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Between style={style}>
      <T variant="bodyBold">{title}</T>
      {onSeeAll ? (
        <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={8} style={(state) => [styles.inline, { gap: 2, borderRadius: radius.sm }, hoverTint(c, state)]}>
          <T variant="bodySm" weight="600" color={c.link}>
            {t.common.seeAll}
          </T>
          <Icon name="chevron-right" color={c.link} variant="xs" />
        </Pressable>
      ) : null}
    </Between>
  );
}

/** .lbl: 12px uppercase metadata over a group ("BANK ACCOUNTS"); 28px
 * above unless `first`. */
export function GroupLabel({ children, first, style }: { children: string; first?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <T variant="groupLabel" style={[{ marginTop: first ? 8 : 28, marginBottom: 8 }, style]}>
      {children.toUpperCase()}
    </T>
  );
}

/** .link as a standalone action ("Change", "Edit"). */
export function Link({ label, onPress, small }: { label: string; onPress: () => void; small?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={(state) => [{ borderRadius: radius.sm }, hoverTint(c, state)]}>
      <T variant={small ? "caption" : "bodySm"} weight="600" color={c.link}>
        {label}
      </T>
    </Pressable>
  );
}

/** .chip / .chip.on: 36px pill. `prefix` is drawn in stone ("USD"). */
export function Chip({
  label,
  prefix,
  dot,
  active,
  onPress,
  trailingIcon,
  style,
}: {
  label: string;
  prefix?: string;
  dot?: string;
  active?: boolean;
  onPress?: () => void;
  trailingIcon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const fg = active ? c.chipActiveText : c.chipText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      disabled={!onPress}
      style={(state) => [styles.chip, { backgroundColor: active ? c.chipActive : c.chip }, onPress ? hoverTint(c, state) : null, style]}
    >
      {dot ? <Dot color={dot} /> : null}
      <Text style={[text.chip, { color: fg }]} numberOfLines={1}>
        {prefix ? <Text style={{ color: c.stone }}>{prefix} </Text> : null}
        {label}
      </Text>
      {trailingIcon ? <Icon name={trailingIcon} color={fg} variant="xs" /> : null}
    </Pressable>
  );
}

/** .badge / .badge.brand */
export function Badge({ label, brand, style, bold }: { label: string; brand?: boolean; style?: StyleProp<ViewStyle>; bold?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: brand ? c.primary : c.chip }, style]}>
      <Text style={[text.badge, { color: brand ? c.onPrimary : c.chipText }, bold ? { fontFamily: FONT["600"] } : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** .dot: 8px status / legend dot. */
export function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** status(): a dot and a caption, never colour alone. */
export function Status({ state, label }: { state: Health; label: string }) {
  const { c } = useTheme();
  const color = state === "over" ? c.negative : state === "near" ? c.warning : c.positive;
  return (
    <Inline gap={6} style={styles.flexShrink}>
      <Dot color={color} />
      <T variant="caption" color={c.mute} numberOfLines={1}>
        {label}
      </T>
    </Inline>
  );
}

/** .hs: bleeds to the screen edges, 10px gaps. */
export function HScroll({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  const { wide } = useLayout();
  // A mouse can't swipe a rail sideways, so on a wide screen it wraps.
  if (wide) return <View style={[styles.wrap, { gap }, style]}>{children}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.hscroll, style]}
      contentContainerStyle={[styles.hscrollContent, { gap }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** .tx: avatar, 15px title over a 13px stone subline, amount on the right;
 * 64px tall with a divider below unless it's the last row. */
export function ListRow({
  left,
  title,
  titleColor,
  sub,
  subColor,
  right,
  rightColor,
  rightSub,
  onPress,
  last,
  dim,
}: {
  left?: ReactNode;
  title: string;
  titleColor?: string;
  sub?: string | null;
  subColor?: string;
  right?: ReactNode;
  rightColor?: string;
  rightSub?: string | null;
  onPress?: () => void;
  last?: boolean;
  /** Archived rows (opacity .6). */
  dim?: boolean;
}) {
  const { c } = useTheme();
  const content = (
    <View style={[styles.txRow, !last && { borderBottomWidth: 1, borderBottomColor: c.divider }, dim && { opacity: 0.6 }]}>
      {left}
      <View style={styles.grow}>
        <T variant="rowTitle" color={titleColor} numberOfLines={1}>
          {title}
        </T>
        {sub ? (
          <T variant="sub" color={subColor} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      {right !== undefined && right !== null ? (
        <View style={styles.rowRight}>
          {typeof right === "string" ? (
            <T variant="amount" color={rightColor}>
              {right}
            </T>
          ) : (
            right
          )}
          {rightSub ? (
            <T variant="sub" num>
              {rightSub}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={(state) => [{ opacity: state.pressed ? 0.6 : 1 }, webRow, hoverTint(c, state)]}>
      {content}
    </Pressable>
  );
}

/** .group: a card of .li rows, hairlines between them. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, { backgroundColor: c.card, borderColor: c.cardBorder }, style]}>
      {rows.map((row, i) => (
        <View key={row.key ?? i} style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.divider } : null}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** .li (setRow): optional 36px icon plate, 15px title, stone value and a
 * chevron on the right (or `right` in place of both). */
export function Row({
  icon,
  iconColor,
  left,
  title,
  titleColor,
  sub,
  value,
  valueSmall,
  right,
  chevron = true,
  onPress,
  dim,
}: {
  icon?: string;
  iconColor?: string;
  left?: ReactNode;
  title: string;
  titleColor?: string;
  /** A stone caption under the title. */
  sub?: string;
  value?: ReactNode;
  /** The value in caption size (.v.cap). */
  valueSmall?: boolean;
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  dim?: boolean;
}) {
  const { c } = useTheme();
  const body = (
    <View style={[styles.li, dim && { opacity: 0.75 }]}>
      {icon ? <IconButton icon={icon} size="sm" label={title} iconColor={iconColor} /> : left}
      {sub ? (
        <View style={styles.grow}>
          <T variant="row" color={titleColor} numberOfLines={1}>
            {title}
          </T>
          <T variant="caption" color={c.stone} num numberOfLines={1}>
            {sub}
          </T>
        </View>
      ) : (
        <T variant="row" color={titleColor} numberOfLines={1} style={styles.grow}>
          {title}
        </T>
      )}
      {right ?? (
        <View style={[styles.inline, { gap: 6, flexShrink: 1 }]}>
          {typeof value === "string" ? (
            <T variant={valueSmall ? "caption" : "row"} color={c.stone} numberOfLines={1}>
              {value}
            </T>
          ) : (
            value
          )}
          {chevron ? <Icon name="chevron-right" color={c.stone} variant="xs" /> : null}
        </View>
      )}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={(state) => [{ opacity: state.pressed ? 0.6 : 1 }, webRow, hoverTint(c, state)]}>
      {body}
    </Pressable>
  );
}

/** .prog: 8px track and fill. */
export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.progressTrack, { backgroundColor: c.track }]}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

export type ButtonVariant = "primary" | "outline" | "soft" | "brand" | "danger" | "text";

/** .btn: 48px pill (.btn.sm 36px). Variants: .p (primary), .o (outline),
 * .s (soft), .brand, .danger (red text on a hairline), .txt (text only). */
export function Button({
  label,
  onPress,
  variant = "primary",
  small,
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  small?: boolean;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const look = {
    primary: { bg: c.buttonBg, fg: c.buttonText, border: "transparent" },
    outline: { bg: "transparent", fg: c.text, border: c.outline },
    soft: { bg: c.soft, fg: c.softText, border: "transparent" },
    brand: { bg: c.primary, fg: c.onPrimary, border: "transparent" },
    danger: { bg: "transparent", fg: c.negativeText, border: c.hairline },
    text: { bg: "transparent", fg: c.text, border: "transparent" },
  }[variant];
  const filled = variant === "primary" || variant === "brand";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        small ? styles.buttonSmall : null,
        variant === "text" ? { height: 44 } : null,
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          // Filled buttons fade on hover; the rest take the --hover tint.
          opacity: disabled ? 0.4 : state.pressed ? 0.8 : filled && isHovered(state) ? 0.88 : 1,
        },
        filled || disabled ? null : hoverTint(c, state),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} color={look.fg} variant="s" /> : null}
          <Text style={[small ? text.buttonSmall : text.button, { color: look.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** A column of buttons, 12px apart; pinned to the bottom unless `inline`.
 * Inside a dialog they move to its footer as a row: the first (primary)
 * on the right, the rest to its left, a destructive one alone on the left. */
export function Actions({ children, inline, style }: { children: ReactNode; inline?: boolean; style?: StyleProp<ViewStyle> }) {
  const slot = useContext(DialogFooterContext);
  useLayoutEffect(() => {
    if (!slot) return;
    const all = Children.toArray(children).filter(isValidElement<{ variant?: ButtonVariant }>);
    const danger = all.filter((b) => b.props.variant === "danger");
    slot.set(
      <View style={styles.dialogActions}>
        {all.filter((b) => b.props.variant !== "danger")}
        {danger.map((b) => (
          <View key={b.key} style={{ marginRight: "auto" }}>
            {b}
          </View>
        ))}
      </View>,
    );
  });
  useLayoutEffect(() => (slot ? () => slot.set(null) : undefined), [slot]);
  if (slot) return null;
  return <View style={[{ gap: 12 }, inline ? null : { marginTop: "auto" }, style]}>{children}</View>;
}

/** Wide screens: two blocks side by side (`side` 360 wide, or `split`
 * main 1.6 : side 1), stacked in order when there isn't room (880). */
export function Columns({
  children,
  split = "main",
  gap = 24,
  style,
}: {
  children: [ReactNode, ReactNode];
  split?: "main" | "side" | "even";
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { twoColumns } = useLayout();
  if (!twoColumns) return <View style={[{ gap }, style]}>{children}</View>;
  const [a, b] = children;
  const left = split === "even" ? 1 : split === "main" ? 1.6 : 1;
  return (
    <View style={[styles.columns, { gap }, style]}>
      <View style={{ flex: left, minWidth: 0 }}>{a}</View>
      <View style={split === "side" ? { width: 360 } : { flex: 1, minWidth: 0 }}>{b}</View>
    </View>
  );
}

/** Wide screens: equal columns (account cards 4, budgets 3, KPIs). Rows
 * stretch to their tallest card; a short last row keeps the column width. */
export function Grid({ children, columns, gap = 24, style }: { children: ReactNode; columns: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={[{ gap }, style]}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.columns, { gap }]}>
          {row.map((item, i) => (
            <View key={i} style={{ flex: 1, minWidth: 0 }}>
              {item}
            </View>
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`pad${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return (
    <T variant="fieldLabel" style={{ marginBottom: 8 }}>
      {children}
    </T>
  );
}

/** .help / .help.err, 8px under a field. */
export function FieldMessage({ error, hint }: { error?: string | null; hint?: ReactNode }) {
  const { c } = useTheme();
  if (error)
    return (
      <T variant="caption" color={c.negativeText} style={{ marginTop: 8 }}>
        {error}
      </T>
    );
  if (hint)
    return (
      <T variant="caption" color={c.stone} style={{ marginTop: 8 }}>
        {hint}
      </T>
    );
  return null;
}

/** The .in box: 56px, 12px radius, hairline; a 2px text-colored ring when
 * focused, a danger hairline on error. Lead / trail icons sit inside. */
export function InputBox({
  children,
  lead,
  trail,
  focused,
  error,
  height = 56,
  style,
}: {
  children: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  focused?: boolean;
  error?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.input,
        { height, backgroundColor: c.field, borderColor: c.fieldBorder },
        focused ? { borderColor: c.text, boxShadow: `0 0 0 1px ${c.text}` } : null,
        error ? { borderColor: c.negative } : null,
        style,
      ]}
    >
      {lead}
      {children}
      {trail}
    </View>
  );
}

/** .field: label, input, help. 20px below, like the artboard. */
export function Field({
  label,
  error,
  hint,
  lead,
  trail,
  mono,
  containerStyle,
  inputStyle,
  ...input
}: TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: ReactNode;
  /** An icon name or a node. */
  lead?: ReactNode;
  trail?: ReactNode;
  mono?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const hasValue = !!input.value;
  const iconColor = hasValue ? c.text : c.placeholder;
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <InputBox
        focused={focused}
        error={!!error}
        lead={typeof lead === "string" ? <Icon name={lead} color={iconColor} variant="s" /> : lead}
        trail={typeof trail === "string" ? <Icon name={trail} color={iconColor} variant="s" /> : trail}
      >
        <TextInput
          placeholderTextColor={c.placeholder}
          keyboardAppearance={c.scheme}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[text.input, { color: c.text }, mono ? { fontFamily: FONT.mono } : null, inputStyle]}
        />
      </InputBox>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

/** A .field that opens a choice: value (or placeholder) with a ⌄. */
export function SelectField({
  label,
  value,
  placeholder,
  lead,
  trail,
  onPress,
  error,
  hint,
  style,
}: {
  label?: string;
  value?: string | null;
  placeholder?: string;
  lead?: ReactNode;
  trail?: ReactNode;
  onPress?: () => void;
  error?: string | null;
  hint?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const color = value ? c.text : c.placeholder;
  return (
    <View style={[styles.field, style]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={!onPress}>
        <InputBox
          error={!!error}
          lead={typeof lead === "string" ? <Icon name={lead} color={color} variant="s" /> : lead}
          trail={trail ?? <Icon name="chevron-down" color={color} variant="s" />}
        >
          <Text style={[text.input, { color }]} numberOfLines={1}>
            {value || placeholder}
          </Text>
        </InputBox>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

/** .seg: pill track with the selected segment in chip-on. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange?: (v: V) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: c.chip }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange?.(o.value)}
            disabled={!onChange}
            style={(state) => [styles.segItem, active ? { backgroundColor: c.chipActive } : hoverTint(c, state)]}
          >
            <Text style={[text.seg, { color: active ? c.chipActiveText : c.mute }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** .tg: 51×31 switch; on is a text-colored track with a canvas knob. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={6}
      style={[styles.toggle, { backgroundColor: value ? c.text : c.track }]}
    >
      <View style={[styles.knob, { left: value ? 23 : 3, backgroundColor: value ? c.canvas : c.stone }]} />
    </Pressable>
  );
}

/** .empty: a 72px ring with an icon, a heading and one next step. */
export function Empty({
  icon = "list",
  title,
  body,
  action,
  fill,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
  /** Centered in the remaining space. */
  fill?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, fill && { flex: 1, justifyContent: "center" }]}>
      <View style={[styles.ring, { backgroundColor: c.chip }]}>
        <Icon name={icon} color={c.mute} variant="l" />
      </View>
      <T variant="heading" align="center">
        {title}
      </T>
      {body ? (
        <T variant="bodySm" color={c.mute} align="center" style={{ maxWidth: 260 }}>
          {body}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

/** .note: a small icon beside a muted caption. */
export function Note({ icon, children, style }: { icon: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[styles.note, style]}>
      <Icon name={icon} color={c.mute} variant="s" />
      <T variant="caption" color={c.mute} style={[styles.grow, { lineHeight: 19 }]}>
        {children}
      </T>
    </View>
  );
}

/** card.inset with an icon and a muted caption ("Updated today at 06:00"). */
export function InsetNote({ icon, children, style }: { icon: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Card inset style={[styles.inline, { gap: 10, alignItems: "flex-start" }, style]}>
      <Icon name={icon} color={c.text} variant="s" />
      <T variant="caption" color={c.mute} style={styles.grow}>
        {children}
      </T>
    </Card>
  );
}

/** The inset card with a danger hairline: "Couldn't save" + what to do. */
export function ErrorCard({ title, children, style }: { title: string; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Card inset style={[{ borderColor: c.negative }, style]}>
      <Inline gap={8}>
        <Icon name="alert" color={c.negativeText} variant="s" />
        <T variant="label" color={c.negativeText} style={styles.grow}>
          {title}
        </T>
      </Inline>
      {children ? (
        <T variant="caption" color={c.mute} style={{ marginTop: 6 }}>
          {children}
        </T>
      ) : null}
    </Card>
  );
}

/** The destructive confirmation (.ph-alert / .alertbox): icon, title, body,
 * a red-text action and a soft Cancel. */
export function ConfirmDialog({
  visible,
  icon = "trash",
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  children,
}: {
  visible: boolean;
  icon?: string;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Extra content above the buttons, e.g. a password field. */
  children?: ReactNode;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <KeyboardBox style={styles.alertBackdrop}>
        <View style={[styles.alertBox, { backgroundColor: c.canvas2, borderColor: c.cardBorder }]}>
          <View style={{ alignSelf: "center", marginBottom: 16 }}>
            <IconButton icon={icon} label={title} iconColor={c.negativeText} iconVariant="md" />
          </View>
          <T variant="heading" align="center" style={{ marginBottom: 8 }}>
            {title}
          </T>
          <T variant="bodySm" color={c.mute} align="center" style={{ marginBottom: 24 }}>
            {body}
          </T>
          {children}
          <View style={{ gap: 10 }}>
            <Button label={confirmLabel} variant="danger" onPress={onConfirm} loading={busy} />
            <Button label={t.common.cancel} variant="soft" onPress={onCancel} />
          </View>
        </View>
      </KeyboardBox>
    </Modal>
  );
}

/** The brand tile ("P"), 48px on onboarding and 64px on the lock screen. */
export function Logo({ size = 48 }: { size?: 48 | 64 }) {
  const { c } = useTheme();
  const big = size === 64;
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: big ? 18 : 14, backgroundColor: c.primary }]}>
      <Text style={[text.logo, { fontSize: big ? 30 : 24, lineHeight: big ? 36 : 30, color: c.onPrimary }]}>P</Text>
    </View>
  );
}

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
  logo: { fontFamily: FONT["700"] },
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
  logo: { alignItems: "center", justifyContent: "center" },
});
