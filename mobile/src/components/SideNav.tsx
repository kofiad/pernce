import { router, usePathname, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useProfile } from "../lib/hooks";
import { useT } from "../lib/i18n";
import type { Nav } from "../lib/layout";
import { FONT, radius, useTheme } from "../lib/theme";
import { AddMenu } from "./AddMenu";
import { Icon } from "./Icon";
import { ProfileAvatar } from "./look";
import { BrandMark, Button, T, hoverTint, isHovered } from "./ui";

type Section = "home" | "accounts" | "activity" | "insights" | "settings";

/** Which nav item a path belongs to; null for the dialogs (transaction,
 * forms), which keep whatever was current under them. */
function sectionOf(path: string): Section | null {
  if (path === "/") return "home";
  const first = path.split("/")[1];
  if (first === "accounts" || first === "activity") return first;
  if (first === "budgets" || first === "analytics") return "insights";
  if (["settings", "categories", "rates", "data", "sync"].includes(first)) return "settings";
  return null;
}

/** The dock on a wide screen. `rail` (768–1023, W01a): 72px, the dock's
 * tabs stacked under the add button, the profile at the bottom. `side`
 * (1024 and up, W01): 240px, logo, an Add pill, the tabs as rows, and a
 * profile row that opens Settings, as the avatar on Home does. The add
 * button opens the add menu as a popover (W02). */
export function SideNav({ nav }: { nav: Exclude<Nav, "dock"> }) {
  const { c } = useTheme();
  const t = useT();
  const profile = useProfile();
  const path = usePathname();
  const [adding, setAdding] = useState(false);
  const [last, setLast] = useState<Section>("home");
  const [lastInsight, setLastInsight] = useState<Href>("/budgets");
  const here = sectionOf(path);
  if (here && here !== last) setLast(here);
  // The Insights item returns to whichever segment was open last.
  if ((path === "/budgets" || path === "/analytics") && path !== lastInsight) setLastInsight(path);
  const current = here ?? last;

  const tabs: { key: Section; icon: string; label: string; href: Href }[] = [
    { key: "home", icon: "home", label: t.tabs.home, href: "/" },
    { key: "accounts", icon: "wallet", label: t.tabs.accounts, href: "/accounts" },
    { key: "activity", icon: "list", label: t.tabs.activity, href: "/activity" },
    { key: "insights", icon: "pie", label: t.tabs.insights, href: lastInsight },
  ];
  const go = (href: Href) => router.navigate(href);
  const tint = `${c.brand}2E`; // --brand at 18%
  const rail = nav === "rail";

  return (
    <View style={[rail ? s.rail : s.side, { borderRightColor: c.hairline }]}>
      {rail ? (
        <>
          <Mark />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.addMenu.title}
            onPress={() => setAdding(true)}
            style={(state) => [s.railAdd, { backgroundColor: c.primary, opacity: state.pressed ? 0.85 : isHovered(state) ? 0.88 : 1 }]}
          >
            <Icon name="plus" color={c.onPrimary} />
          </Pressable>
          {tabs.map((tab) => {
            const on = tab.key === current;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={tab.label}
                onPress={() => go(tab.href)}
                style={(state) => [s.railItem, !on ? hoverTint(c, state) : null]}
              >
                <View style={[s.indicator, on && { backgroundColor: tint }]}>
                  <Icon name={tab.icon} color={on ? c.brand : c.stone} />
                </View>
                <Text style={[s.railLabel, { color: on ? c.text : c.stone }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          {profile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.common.settings}
              onPress={() => go("/settings")}
              style={[s.railProfile, current === "settings" ? { boxShadow: `0 0 0 2px ${c.canvas}, 0 0 0 4px ${c.brand}` } : null]}
            >
              <ProfileAvatar profile={profile} />
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <View style={s.logo}>
            <Mark />
            <Text style={[s.wordmark, { color: c.text }]}>Pernce</Text>
          </View>
          <Button label={t.common.add} icon="plus" variant="brand" onPress={() => setAdding(true)} style={{ marginBottom: 20 }} />
          {tabs.map((tab) => {
            const on = tab.key === current;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => go(tab.href)}
                style={(state) => [s.item, on ? { backgroundColor: tint } : hoverTint(c, state)]}
              >
                <Icon name={tab.icon} color={on ? c.brand : c.stone} />
                <Text style={[s.itemLabel, { color: on ? c.text : c.stone }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          {profile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.common.settings}
              onPress={() => go("/settings")}
              style={(state) => [s.profile, current === "settings" ? { backgroundColor: tint } : hoverTint(c, state)]}
            >
              <ProfileAvatar profile={profile} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T variant="label" numberOfLines={1}>
                  {profile.name.trim() || t.settings.yourName}
                </T>
                <T variant="caption" color={c.stone} numberOfLines={1}>
                  {t.common.settings}
                </T>
              </View>
              <Icon name="gear" color={c.stone} variant="s" />
            </Pressable>
          ) : null}
        </>
      )}
      <AddMenu visible={adding} onClose={() => setAdding(false)} anchor={rail ? { top: 68, left: 80 } : { top: 140, left: 16 }} />
    </View>
  );
}

/** The brand mark at 32px, beside the wordmark on the sidebar. */
function Mark() {
  return <BrandMark size={32} />;
}

const s = StyleSheet.create({
  side: { width: 240, borderRightWidth: 1, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  rail: { width: 72, borderRightWidth: 1, paddingTop: 20, paddingBottom: 24, alignItems: "center", gap: 16 },
  logo: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 24 },
  wordmark: { fontFamily: FONT["600"], fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, height: 44, paddingHorizontal: 14, borderRadius: radius.full },
  itemLabel: { fontFamily: FONT["600"], fontSize: 15, lineHeight: 20 },
  profile: { flexDirection: "row", alignItems: "center", gap: 10, height: 56, paddingHorizontal: 10, borderRadius: radius.full },
  railAdd: { width: 48, height: 48, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  railItem: { width: 64, alignItems: "center", gap: 2, paddingVertical: 4, borderRadius: radius.md },
  indicator: { width: 52, height: 30, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  railLabel: { fontFamily: FONT["600"], fontSize: 11, lineHeight: 14 },
  railProfile: { borderRadius: radius.full },
});
