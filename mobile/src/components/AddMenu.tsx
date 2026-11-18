import { router, type Href } from "expo-router";
import { useEffect, useRef, type ComponentRef } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useLookups } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { radius, useTheme } from "../lib/theme";
import { ChoiceSheet } from "./inputs";
import { IconButton, T, hoverTint } from "./ui";

type TxType = "expense" | "income" | "transfer";

/** Plates per row (.addm). */
const COLUMNS = 3;

/** M14 Add menu: transactions on the first row, things to set up on the
 * second; each opens its own form. On a wide screen (`anchor`) it is the
 * add popover (W02): the same plates in a 320 card under the Add button,
 * no title or dim; Esc or a click outside closes it. Focus starts on
 * Expense and the arrow keys move between plates (Home / End too). */
export function AddMenu({ visible, onClose, anchor }: { visible: boolean; onClose: () => void; anchor?: { top: number; left: number } }) {
  const { c } = useTheme();
  const t = useT();
  const { accounts } = useLookups();
  // On iOS a modal screen can't be presented while the sheet is still
  // sliding away, so the push waits for the sheet's onDismiss there.
  const pending = useRef<Href | null>(null);
  const go = () => {
    if (pending.current) router.push(pending.current);
    pending.current = null;
  };
  const open = (href: Href) => {
    pending.current = href;
    onClose();
    if (Platform.OS !== "ios") go();
  };
  // A transaction needs an account to post to; without one, start there.
  const tx = (type: TxType): Href => (accounts.size > 0 ? { pathname: "/transaction", params: { type } } : "/account-form");
  const items: { icon: string; label: string; href: Href; color?: string }[] = [
    { icon: "arrow-up-right", label: t.common.expense, href: tx("expense"), color: c.negativeText },
    { icon: "arrow-down-left", label: t.common.income, href: tx("income"), color: c.positiveText },
    { icon: "swap", label: t.common.transfer, href: tx("transfer") },
    { icon: "wallet", label: t.common.account, href: "/account-form" },
    { icon: "pie", label: t.addMenu.budget, href: "/budget-form" },
    { icon: "tag", label: t.common.category, href: "/category-form" },
  ];
  // Web: the popover's plates are DOM elements under react-native-web.
  const plateRefs = useRef<(ComponentRef<typeof Pressable> | null)[]>([]);
  const popoverRef = useRef<ComponentRef<typeof View>>(null);
  const popover = !!anchor;
  useEffect(() => {
    if (!visible || !popover || Platform.OS !== "web") return;
    const plate = (i: number) => plateRefs.current[i] as unknown as HTMLElement | null;
    const timer = setTimeout(() => plate(0)?.focus());
    const el = popoverRef.current as unknown as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      const at = plateRefs.current.findIndex((r) => (r as unknown) === document.activeElement);
      const last = plateRefs.current.length - 1;
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[e.key];
      let next: number | null = null;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      else if (step !== undefined) next = at < 0 ? 0 : Math.min(last, Math.max(0, at + step));
      if (next === null) return;
      e.preventDefault();
      plate(next)?.focus();
    };
    el?.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      el?.removeEventListener("keydown", onKey);
    };
  }, [visible, popover]);

  const plates = (
    <View style={s.menu}>
      {items.map((i, n) => (
        <Pressable
          key={i.label}
          ref={(r) => {
            plateRefs.current[n] = r;
          }}
          accessibilityRole="button"
          accessibilityLabel={i.label}
          onPress={() => open(i.href)}
          style={(state) => [s.menuItem, anchor ? [s.menuItemPopover, hoverTint(c, state)] : null]}
        >
          <IconButton icon={i.icon} label={i.label} px={56} iconColor={i.color} />
          <T variant="caption" weight="600" align="center" numberOfLines={1}>
            {i.label}
          </T>
        </Pressable>
      ))}
    </View>
  );

  if (anchor) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t.common.close} tabIndex={-1} />
        <View
          ref={popoverRef}
          accessibilityLabel={t.addMenu.title}
          style={[s.popover, { top: anchor.top, left: anchor.left, backgroundColor: c.sheet, borderColor: c.hairline }]}
        >
          {plates}
        </View>
      </Modal>
    );
  }
  return (
    <ChoiceSheet visible={visible} title={t.addMenu.title} onClose={onClose} onDismiss={go}>
      {plates}
    </ChoiceSheet>
  );
}

const s = StyleSheet.create({
  menu: { flexDirection: "row", flexWrap: "wrap", rowGap: 20, paddingTop: 4, paddingBottom: 8 },
  menuItem: { width: "33.33%", alignItems: "center", gap: 8 },
  menuItemPopover: { paddingVertical: 4, borderRadius: radius.md },
  popover: { position: "absolute", width: 320, borderWidth: 1, borderRadius: radius.lg, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 8 },
});
