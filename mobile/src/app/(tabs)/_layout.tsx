import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import * as QuickActions from "expo-quick-actions";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AddMenu } from "../../components/AddMenu";
import { Icon } from "../../components/Icon";
import { DOCK_HEIGHT, useDockBottom } from "../../components/ui";
import type { Messages } from "../../i18n";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { FONT, radius, useTheme } from "../../lib/theme";

type TxType = "expense" | "income" | "transfer";

/** The home-screen shortcuts (long-press the app icon): one per
 * transaction type, straight into the full form. Set here rather than in
 * the root layout: these routes only exist once the app is set up, and the
 * routing hook must not run in the root layout. */
function shortcuts(t: Messages): QuickActions.Action[] {
  const items: { type: TxType; title: string; subtitle: string; symbol: string }[] = [
    { type: "expense", title: t.common.expense, subtitle: t.addMenu.expenseHint, symbol: "arrow.up.right" },
    { type: "income", title: t.common.income, subtitle: t.addMenu.incomeHint, symbol: "arrow.down.left" },
    { type: "transfer", title: t.common.transfer, subtitle: t.addMenu.transferHint, symbol: "arrow.left.arrow.right" },
  ];
  return items.map((i) => ({
    id: `add-${i.type}`,
    title: i.title,
    subtitle: i.subtitle,
    // An SF Symbol on iOS; the app icon on Android.
    icon: Platform.OS === "ios" ? `symbol:${i.symbol}` : "ic_launcher",
    params: { href: `/transaction?type=${i.type}` },
  }));
}

/** Opens a shortcut's `params.href`: the one the app was launched with,
 * then any used while it runs. Like expo-quick-actions/router's hook, which
 * imports expo-router/build/hooks, a path expo-router 58 no longer exports. */
function useQuickActionRouting() {
  useEffect(() => {
    const open = (action: QuickActions.Action | null | undefined) => {
      const href = action?.params?.href;
      if (typeof href === "string") setTimeout(() => router.navigate(href as Href, { withAnchor: true }));
    };
    open(QuickActions.initial);
    const sub = QuickActions.addListener(open);
    return () => sub.remove();
  }, []);
}

/** Budgets and Trends (the analytics route) share the Insights tab. */
const INSIGHTS = ["budgets", "analytics"];

/** The artboard's .tabbar: a floating dock. Four tabs in a card-surface
 * capsule (the active icon in a brand-tinted indicator, its label in text
 * color), then the add button, which opens the add menu (M14) from every
 * tab. */
function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const t = useT();
  const bottom = useDockBottom();
  const { wide } = useLayout();
  const [adding, setAdding] = useState(false);
  const current = state.routes[state.index].name;
  // The Insights tab returns to whichever segment was open last.
  const lastInsight = useRef("budgets");
  useEffect(() => {
    if (INSIGHTS.includes(current)) lastInsight.current = current;
  }, [current]);

  const tabs = [
    { name: "index", icon: "home", label: t.tabs.home },
    { name: "accounts", icon: "wallet", label: t.tabs.accounts },
    { name: "activity", icon: "list", label: t.tabs.activity },
    { name: "insights", icon: "pie", label: t.tabs.insights },
  ];
  // Wide screens navigate from the rail or the sidebar (SideNav).
  if (wide) return null;
  return (
    <View style={[s.dock, { bottom }]}>
      <View style={[s.bar, { backgroundColor: c.card, borderColor: c.hairline }]}>
        {tabs.map((tab) => {
          const active = tab.name === "insights" ? INSIGHTS.includes(current) : current === tab.name;
          const target = tab.name === "insights" ? lastInsight.current : tab.name;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              style={s.item}
              onPress={() => {
                const route = state.routes.find((r) => r.name === target);
                if (!route) return;
                const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!active && !event.defaultPrevented) navigateToTab(route.key);
              }}
            >
              {/* --brand at 18% (2E hex alpha) */}
              <View style={[s.indicator, active && { backgroundColor: `${c.brand}2E` }]}>
                <Icon name={tab.icon} color={active ? c.brand : c.stone} />
              </View>
              <Text style={[s.label, { color: active ? c.text : c.stone }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.addMenu.title}
        onPress={() => setAdding(true)}
        style={({ pressed }) => [s.add, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Icon name="plus" color={c.onPrimary} variant="l" />
      </Pressable>
      <AddMenu visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}

export default function TabsLayout() {
  const t = useT();
  useQuickActionRouting();
  // Re-set when the language changes, so the shortcuts' text follows.
  useEffect(() => {
    QuickActions.setItems(shortcuts(t)).catch(() => {});
  }, [t]);
  return (
    // freezeOnBlur: a tab you're not looking at stops rendering, so a write
    // re-reads only the visible tab's data (useData re-runs every mounted
    // reader on any change); a frozen tab catches up when you open it.
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Tabs.Screen name="index" options={{ title: t.tabs.home }} />
      <Tabs.Screen name="accounts" options={{ title: t.tabs.accounts }} />
      <Tabs.Screen name="activity" options={{ title: t.tabs.activity }} />
      <Tabs.Screen name="budgets" options={{ title: t.tabs.insights }} />
      <Tabs.Screen name="analytics" options={{ title: t.tabs.insights }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  dock: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  bar: {
    flex: 1,
    height: DOCK_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: radius.full,
  },
  item: { flex: 1, alignItems: "center", gap: 2 },
  indicator: { width: 52, height: 30, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: FONT["600"], fontSize: 11, lineHeight: 14 },
  add: { width: DOCK_HEIGHT, height: DOCK_HEIGHT, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
});
