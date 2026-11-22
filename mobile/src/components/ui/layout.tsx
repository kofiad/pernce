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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useT } from "../../lib/i18n";
import { NARROW_MAX, PAGE_MAX, useLayout } from "../../lib/layout";
import { radius, useTheme } from "../../lib/theme";
import { Icon } from "../Icon";
import { KeyboardBox, KeyboardScrollView } from "../keyboard";
import { type ButtonVariant, IconButton, Inline, T } from "./display";
import { DOCK_HEIGHT, hoverTint, styles, text, webRow } from "./styles";

/** Layout building blocks: screens, sheets and dialogs, cards, rows, grids, headers and section labels. */

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
