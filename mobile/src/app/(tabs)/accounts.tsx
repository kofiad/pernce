import { fromMinor, toBaseCurrency } from "@pernce/core";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { CurrencySheet } from "../../components/inputs";
import { Avatar, Between, Button, Card, Chip, Columns, Empty, GroupLabel, IconButton, ListRow, PageHeader, Screen, T } from "../../components/ui";
import { listAccounts, type AccountWithBalance } from "../../data/accounts";
import { updateProfile } from "../../data/profile";
import { getRatesMap } from "../../data/rates";
import { netWorth } from "../../data/reports";
import { db } from "../../db/client";
import { useData } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { fmtMajor, fmtMinor } from "../../lib/money";
import { useTheme } from "../../lib/theme";

/** Group headings, in the artboard's order. */
const GROUPS = ["bank", "mobile_money", "investment", "cash", "other"];

/** M06 Accounts: grouped by type; balances in another currency show their
 * base value underneath. */
export default function Accounts() {
  const { c } = useTheme();
  const t = useT();
  const all = useData((d) => listAccounts(d, { includeArchived: true }));
  const nw = useData(netWorth);
  const rates = useData(getRatesMap);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const { wide } = useLayout();
  const active = all.filter((a) => !a.archived);
  const archived = all.filter((a) => a.archived);
  const base = nw.baseCurrency;

  const groups = GROUPS.map((key) => ({ key, label: t.accountGroups[key], rows: active.filter((a) => a.type === key) }))
    .filter((g) => g.rows.length > 0);

  const row = (a: AccountWithBalance, last: boolean, dim = false) => (
    <ListRow
      key={a.id}
      left={<Avatar color={a.color} label={a.name} icon={a.icon ?? undefined} size="sm" />}
      title={a.name}
      sub={[t.accountTypes[a.type] ?? a.type, a.currency, dim ? t.common.archived : null].filter(Boolean).join(" · ")}
      right={fmtMinor(a.balance, a.currency)}
      rightColor={a.balance < 0 ? c.negativeText : undefined}
      rightSub={
        a.currency === base || dim ? null : `≈ ${fmtMajor(toBaseCurrency(fromMinor(a.balance, a.currency), a.currency, base, rates), base)}`
      }
      onPress={() => router.push({ pathname: "/accounts/[id]", params: { id: a.id } })}
      last={last}
      dim={dim}
    />
  );

  const sections = [
    ...groups.map((g) => ({ key: g.key, label: g.label, rows: g.rows, dim: false })),
    ...(archived.length > 0 ? [{ key: "archived", label: t.common.archived, rows: archived, dim: true }] : []),
  ];
  const addAccount = () => router.push("/account-form");

  return (
    <Screen tabs edges={["top"]}>
      <PageHeader
        title={t.tabs.accounts}
        right={
          wide ? (
            <Button label={t.common.addAccount} icon="plus" onPress={addAccount} />
          ) : (
            <IconButton icon="plus" size="sm" variant="brand" label={t.common.addAccount} onPress={addAccount} />
          )
        }
      />
      <Card style={wide ? { padding: 32, marginBottom: 24 } : { marginBottom: 8 }}>
        <Between>
          <View style={{ flexShrink: 1 }}>
            <T variant="caption" color={c.mute}>
              {t.accounts.totalAcross(active.length)}
            </T>
            <T variant={wide ? "display" : "headingMd"} num numberOfLines={1}>
              {fmtMajor(nw.totalBase, base)}
            </T>
          </View>
          <Chip label={base} active trailingIcon="chevron-down" onPress={() => setCurrencyOpen(true)} />
        </Between>
      </Card>
      <CurrencySheet
        visible={currencyOpen}
        title={t.accounts.showTotalsIn}
        value={base}
        onClose={() => setCurrencyOpen(false)}
        onChange={(baseCurrency) => updateProfile(db, { baseCurrency })}
      />

      {active.length === 0 ? (
        <Empty icon="wallet" title={t.common.noAccountsYet} body={t.accounts.emptyBody} />
      ) : null}

      {wide ? (
        // W03: each group is a card, dealt into two columns in order.
        <Columns split="even" style={{ alignItems: "flex-start" }}>
          {[0, 1].map((col) => (
            <View key={col} style={{ gap: 24 }}>
              {sections
                .filter((_, i) => i % 2 === col)
                .map((g) => (
                  <Card key={g.key} style={{ paddingHorizontal: 24, paddingTop: 0, paddingBottom: 8 }}>
                    <GroupLabel>{g.label}</GroupLabel>
                    {g.rows.map((a, i) => row(a, i === g.rows.length - 1, g.dim))}
                  </Card>
                ))}
            </View>
          )) as [ReactNode, ReactNode]}
        </Columns>
      ) : (
        sections.map((g) => (
          <View key={g.key}>
            <GroupLabel>{g.label}</GroupLabel>
            {g.rows.map((a, i) => row(a, i === g.rows.length - 1, g.dim))}
          </View>
        ))
      )}
    </Screen>
  );
}
