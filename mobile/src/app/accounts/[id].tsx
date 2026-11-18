import { fromMinor, toBaseCurrency } from "@pernce/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { TrendLine } from "../../components/charts";
import { ChoiceSheet } from "../../components/inputs";
import { TransactionRow } from "../../components/TransactionRow";
import {
  Actions,
  Avatar,
  Between,
  Button,
  Card,
  Columns,
  ConfirmDialog,
  Crumb,
  Empty,
  GroupLabel,
  IconButton,
  ListRow,
  NavHeader,
  Screen,
  T,
} from "../../components/ui";
import { getAccountWithBalance, setAccountArchived } from "../../data/accounts";
import { accountBalanceTrend } from "../../data/reports";
import { listTransactions } from "../../data/transactions";
import { db } from "../../db/client";
import { useData, useLookups } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { currencyPrefix, fmtMajor, fmtMinor } from "../../lib/money";
import { useTheme } from "../../lib/theme";

const fmtRate = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toPrecision(3));

/** M11 Account detail: the native balance first, its base value second;
 * add, transfer, edit; archive at the bottom. */
export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const t = useT();
  const [limit, setLimit] = useState(4);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const account = useData((d) => getAccountWithBalance(d, id), [id]);
  const rows = useData((d) => listTransactions(d, { accountId: id, limit: limit + 1 }), [id, limit]);
  const trend = useData((d) => accountBalanceTrend(d, id), [id]);
  const lookups = useLookups();
  const { base, rates } = lookups;
  const { wide } = useLayout();

  if (!account) {
    return (
      <Screen>
        <NavHeader />
        <Empty icon="wallet" title={t.accounts.notFound} fill />
      </Screen>
    );
  }

  const typeLabel = t.accountTypes[account.type] ?? account.type;
  const edit = () => router.push({ pathname: "/account-form", params: { id: account.id } });
  const shown = rows.slice(0, limit);
  const rateToBase = toBaseCurrency(1, account.currency, base, rates);
  const archive = () => {
    setAccountArchived(db, account.id, !account.archived);
    setConfirm(false);
  };
  const add = () => router.push({ pathname: "/transaction", params: { accountId: account.id } });
  const transfer = () => router.push({ pathname: "/transaction", params: { accountId: account.id, type: "transfer" } });
  const converted =
    account.currency !== base
      ? `≈ ${fmtMajor(toBaseCurrency(fromMinor(account.balance, account.currency), account.currency, base, rates), base)} · 1 ${account.currency} = ${currencyPrefix(base)}${fmtRate(rateToBase)}`
      : null;
  const activity =
    shown.length === 0 ? (
      <T variant="bodySm" color={c.mute} style={{ paddingVertical: 12 }}>
        {t.accounts.noTransactions}
      </T>
    ) : (
      shown.map((tx, i) => <TransactionRow key={tx.id} t={tx} lookups={lookups} last={i === shown.length - 1} />)
    );
  const confirmArchive = (
    <ConfirmDialog
      visible={confirm}
      icon="archive"
      title={t.accounts.archiveTitle}
      body={t.accounts.archiveBody}
      confirmLabel={t.accounts.archive}
      onConfirm={archive}
      onCancel={() => setConfirm(false)}
    />
  );
  const archiveButton = (
    <Button
      label={account.archived ? t.accounts.restore : t.accounts.archive}
      variant="danger"
      icon="archive"
      onPress={() => (account.archived ? archive() : setConfirm(true))}
    />
  );

  if (wide) {
    // W07: activity on the left, the balance card on the right; M11's
    // plates become header buttons and the crumb replaces the back button.
    return (
      <Screen>
        <Crumb parent={{ label: t.tabs.accounts, href: "/accounts" }} title={account.name} />
        <Between style={{ marginBottom: 28, flexWrap: "wrap" }}>
          <View style={[s.inline, { gap: 16, flexShrink: 1 }]}>
            <Avatar color={account.color} label={account.name} icon={account.icon ?? undefined} size="lg" />
            <View style={{ flexShrink: 1 }}>
              <T variant="title" numberOfLines={1}>
                {account.name}
              </T>
              <T variant="bodySm" color={c.mute} numberOfLines={1}>
                {[typeLabel, account.currency, account.archived ? t.common.archived : null].filter(Boolean).join(" · ")}
              </T>
            </View>
          </View>
          <View style={[s.inline, { gap: 10 }]}>
            <Button label={t.common.transfer} icon="swap" variant="outline" onPress={transfer} />
            <Button label={t.common.edit} icon="edit" variant="soft" onPress={edit} />
            <Button label={t.common.add} icon="plus" onPress={add} />
          </View>
        </Between>
        <Columns split="side" style={{ alignItems: "flex-start" }}>
          <Card style={{ padding: 32 }}>
            <T variant="heading" style={{ marginBottom: 8 }}>
              {t.tabs.activity}
            </T>
            {activity}
            {rows.length > limit ? (
              <Button label={t.accounts.showMore} variant="outline" small onPress={() => setLimit(limit + 20)} style={{ alignSelf: "flex-start", marginTop: 20 }} />
            ) : null}
          </Card>
          <View style={{ gap: 16 }}>
            <Card style={{ padding: 32 }}>
              <T variant="caption" color={c.mute}>
                {t.accounts.balance}
              </T>
              <T variant="display" num numberOfLines={1} color={account.balance < 0 ? c.negativeText : c.text} style={{ marginVertical: 4 }}>
                {fmtMinor(account.balance, account.currency)}
              </T>
              {converted ? (
                <T variant="bodySm" color={c.stone} num>
                  {converted}
                </T>
              ) : null}
              <View style={{ marginTop: 24 }}>
                <TrendLine values={trend} height={96} />
              </View>
              <T variant="caption" color={c.mute} style={{ marginTop: 8 }}>
                {t.common.lastSixMonths}
              </T>
            </Card>
            {archiveButton}
          </View>
        </Columns>
        {confirmArchive}
      </Screen>
    );
  }

  return (
    <Screen>
      <NavHeader right={<IconButton icon="dots" size="sm" variant="ghost" iconVariant="md" label={t.common.more} onPress={() => setMenu(true)} />} />
      <View style={s.hero}>
        <Avatar color={account.color} label={account.name} icon={account.icon ?? undefined} size="lg" />
        <T variant="bodySm" color={c.mute} align="center" style={{ marginTop: 10 }}>
          {[account.name, typeLabel, account.archived ? t.common.archived : null].filter(Boolean).join(" · ")}
        </T>
        <T variant="display" num numberOfLines={1} color={account.balance < 0 ? c.negativeText : c.text}>
          {fmtMinor(account.balance, account.currency)}
        </T>
        {converted ? (
          <T variant="bodySm" color={c.stone} num align="center">
            {converted}
          </T>
        ) : null}
      </View>

      <View style={s.actions}>
        <Action icon="plus" label={t.common.add} onPress={add} />
        <Action icon="swap" label={t.common.transfer} onPress={transfer} />
        <Action icon="edit" label={t.common.edit} onPress={edit} />
      </View>

      <Card style={{ marginBottom: 8 }}>
        <Between style={{ marginBottom: 10 }}>
          <T variant="label">{t.accounts.balance}</T>
          <T variant="caption" color={c.mute}>
            {t.common.lastSixMonths}
          </T>
        </Between>
        <TrendLine values={trend} height={80} />
      </Card>

      <GroupLabel>{t.tabs.activity}</GroupLabel>
      {activity}

      <Actions inline style={{ marginTop: 20 }}>
        {rows.length > limit ? <Button label={t.accounts.showMore} variant="soft" onPress={() => setLimit(limit + 20)} /> : null}
        {archiveButton}
      </Actions>

      <ChoiceSheet visible={menu} title={account.name} onClose={() => setMenu(false)}>
        <ListRow
          left={<IconButton icon="edit" size="sm" label={t.accounts.edit} />}
          title={t.accounts.edit}
          onPress={() => {
            setMenu(false);
            edit();
          }}
        />
        <ListRow
          left={<IconButton icon="archive" size="sm" label={t.common.archive} iconColor={c.negativeText} />}
          title={account.archived ? t.accounts.restore : t.accounts.archive}
          titleColor={account.archived ? undefined : c.negativeText}
          onPress={() => {
            setMenu(false);
            if (account.archived) archive();
            else setConfirm(true);
          }}
          last
        />
      </ChoiceSheet>

      {confirmArchive}
    </Screen>
  );
}

function Action({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.action}>
      <IconButton icon={icon} label={label} />
      <T variant="caption" weight="500" color={c.mute} style={{ fontSize: 12, lineHeight: 17 }}>
        {label}
      </T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: "center", gap: 6, marginBottom: 24 },
  inline: { flexDirection: "row", alignItems: "center" },
  actions: { flexDirection: "row", gap: 8, marginBottom: 24 },
  action: { flex: 1, alignItems: "center", gap: 8 },
});
