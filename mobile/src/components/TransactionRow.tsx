import { fromMinor, resolveColor, toBaseCurrency } from "@pernce/core";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { Transaction } from "../db/schema";
import type { Messages } from "../i18n";
import type { Lookups } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { fmtMajor, fmtMinor } from "../lib/money";
import { radius, useTheme, type Palette } from "../lib/theme";
import { Avatar, Dot, ListRow, T, hoverTint } from "./ui";

type RowLookups = Pick<Lookups, "accounts" | "categories" | "rates" | "base">;

/** What a transaction row shows, for the phone row and the wide table. */
function describe(t: Transaction, lookups: RowLookups, tr: Messages, c: Palette) {
  const { accounts, categories, rates, base } = lookups;
  const account = accounts.get(t.accountId);
  const category = t.categoryId ? categories.get(t.categoryId) : undefined;
  const approx = (minor: number, currency: string) =>
    currency === base ? null : `≈ ${fmtMajor(toBaseCurrency(fromMinor(minor, currency), currency, base, rates), base)}`;

  if (t.type === "transfer") {
    const to = t.transferAccountId ? accounts.get(t.transferAccountId) : undefined;
    const route = `${account?.name ?? tr.common.account} → ${to?.name ?? tr.common.account}`;
    return {
      icon: "swap",
      avatarColor: "accent-slate",
      title: route,
      sub: [tr.common.transfer, t.fee > 0 ? tr.transaction.feeAmount(fmtMinor(t.fee, t.currency)) : null, t.note || null].filter(Boolean).join(" · "),
      amount: fmtMinor(t.amount, t.currency),
      amountColor: undefined as string | undefined,
      rightSub:
        t.transferCurrency && t.transferCurrency !== t.currency ? `→ ${fmtMinor(t.transferAmount ?? 0, t.transferCurrency)}` : null,
      // The table's columns.
      description: t.note || tr.common.transfer,
      categoryName: tr.common.transfer,
      accountName: route,
    };
  }
  const catName = category?.name ?? (t.type === "income" ? tr.common.income : tr.common.uncategorized);
  const income = t.type === "income";
  return {
    icon: category?.icon ?? "more",
    avatarColor: category?.color ?? "stone",
    title: t.note || catName,
    sub: `${catName} · ${account?.name ?? ""}`,
    amount: income ? fmtMinor(t.amount, t.currency, { signDisplay: "always" }) : fmtMinor(-t.amount, t.currency),
    amountColor: income ? c.positiveText : undefined,
    rightSub: approx(t.amount, t.currency),
    description: t.note || catName,
    categoryName: catName,
    accountName: account?.name ?? "",
  };
}

const open = (t: Transaction) => router.push({ pathname: "/transaction", params: { id: t.id } });

/** txRow: category avatar, note (or category) over "Category · Account",
 * signed amount on the right with its base-currency value under it. A
 * transfer reads "From → To", "Transfer · fee $2.00", and what arrived. */
export function TransactionRow({ t, lookups, last }: { t: Transaction; lookups: RowLookups; last?: boolean }) {
  const { c } = useTheme();
  const tr = useT();
  const d = describe(t, lookups, tr, c);
  return (
    <ListRow
      left={<Avatar color={d.avatarColor} icon={d.icon} size="sm" />}
      title={d.title}
      sub={d.sub}
      right={d.amount}
      rightColor={d.amountColor}
      rightSub={d.rightSub}
      onPress={() => open(t)}
      last={last}
    />
  );
}

/** The wide ledger's columns (W04): description, category, account,
 * converted, amount. */
const COLUMNS = [2.2, 1.5, 1.7, 1.1, 1.1];

export function TransactionTableHeader() {
  const { c } = useTheme();
  const tr = useT();
  const labels = [tr.activity.columns.description, tr.common.category, tr.common.account, tr.activity.columns.converted, tr.activity.columns.amount];
  return (
    <View style={[s.row, s.header, { borderBottomColor: c.hairline }]}>
      {labels.map((label, i) => (
        <T key={label} variant="groupLabel" align={i >= 3 ? "right" : "left"} style={{ flex: COLUMNS[i] }} numberOfLines={1}>
          {label.toUpperCase()}
        </T>
      ))}
    </View>
  );
}

export function TransactionTableRow({ t, lookups, last }: { t: Transaction; lookups: RowLookups; last?: boolean }) {
  const { c } = useTheme();
  const tr = useT();
  const d = describe(t, lookups, tr, c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={d.title}
      onPress={() => open(t)}
      style={(state) => [s.row, s.cell, !last && { borderBottomWidth: 1, borderBottomColor: c.divider }, hoverTint(c, state)]}
    >
      <View style={[s.lead, { flex: COLUMNS[0] }]}>
        <Avatar color={d.avatarColor} icon={d.icon} size="sm" />
        <T variant="rowTitle" numberOfLines={1} style={s.shrink}>
          {d.description}
        </T>
      </View>
      <View style={{ flex: COLUMNS[1], alignItems: "flex-start" }}>
        <View style={[s.badge, { backgroundColor: c.chip }]}>
          <Dot color={resolveColor(d.avatarColor)} />
          <T variant="caption" color={c.chipText} numberOfLines={1} style={s.shrink}>
            {d.categoryName}
          </T>
        </View>
      </View>
      <T variant="bodySm" color={c.mute} numberOfLines={1} style={{ flex: COLUMNS[2] }}>
        {d.accountName}
      </T>
      <T variant="bodySm" color={c.stone} num align="right" numberOfLines={1} style={{ flex: COLUMNS[3] }}>
        {d.rightSub ?? ""}
      </T>
      <T variant="amount" color={d.amountColor} align="right" numberOfLines={1} style={{ flex: COLUMNS[4] }}>
        {d.amount}
      </T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 12 },
  header: { paddingBottom: 12, borderBottomWidth: 1 },
  cell: { minHeight: 64, paddingVertical: 10, borderRadius: radius.sm },
  lead: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  shrink: { flexShrink: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
});
