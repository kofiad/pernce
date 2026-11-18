import { router } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useT } from "../lib/i18n";
import { useLayout } from "../lib/layout";
import { Between, Inline, PageHeader, Segmented, T } from "./ui";

export type InsightsSegment = "budgets" | "analytics";

const HREF = { budgets: "/budgets", analytics: "/analytics" } as const;

/** M09/M10 insh(): the Insights tab's header. Budgets and Trends are two
 * routes behind one tab; the segmented control swaps between them. On a
 * wide screen it sits beside the title (W05). */
export function InsightsHeader({ segment, right }: { segment: InsightsSegment; right?: ReactNode }) {
  const t = useT();
  const { wide } = useLayout();
  const segmented = (
    <Segmented
      options={[
        { value: "budgets", label: t.tabs.budgets },
        { value: "analytics", label: t.tabs.trends },
      ]}
      value={segment}
      onChange={(v) => {
        if (v !== segment) router.navigate(HREF[v]);
      }}
      style={wide ? { width: 260 } : { marginTop: -8, marginBottom: 20 }}
    />
  );
  if (wide) {
    return (
      <Between style={{ minHeight: 48, marginBottom: 28, flexWrap: "wrap" }}>
        <Inline gap={24}>
          <T variant="title">{t.tabs.insights}</T>
          {segmented}
        </Inline>
        {right ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>{right}</View> : null}
      </Between>
    );
  }
  return (
    <>
      <PageHeader title={t.tabs.insights} right={right} />
      {segmented}
    </>
  );
}
