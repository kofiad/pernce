import { resolveColor } from "@pernce/core";
import { router, type Href } from "expo-router";
import { Fragment } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "../../components/Icon";
import { ProfileAvatar } from "../../components/look";
import { TransactionRow } from "../../components/TransactionRow";
import {
  Avatar,
  Between,
  Button,
  Card,
  Chip,
  Columns,
  Empty,
  Grid,
  HScroll,
  IconButton,
  Inline,
  ProgressBar,
  Screen,
  SectionHead,
  Status,
  T,
} from "../../components/ui";
import { budgetsForMonth } from "../../data/budgets";
import { budgetLook } from "../../data/look";
import { lastRatesFetch } from "../../data/rates";
import { monthlySeriesFor, netWorth } from "../../data/reports";
import { listTransactions } from "../../data/transactions";
import { summarize } from "../../lib/budgetHealth";
import { useData, useLookups, useProfile } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { fmtBare, fmtMajor, fmtMinor, fmtShort } from "../../lib/money";
import { useTheme } from "../../lib/theme";
import { useAutoRates } from "../../lib/useAutoRates";
import { SyncBannerSlot, useSyncRefresh } from "../../lib/syncFeature";

/** M05 Home: net worth in the base currency, holdings per currency, quick
 * actions, accounts rail, budget health, recent activity. */
export default function Home() {
  const { c } = useTheme();
  const t = useT();
  const profile = useProfile();
  const nw = useData(netWorth);
  const thisMonth = useData((d) => monthlySeriesFor(d, 1).at(-1));
  const { wide, twoColumns } = useLayout();
  const recent = useData((d) => listTransactions(d, { limit: wide ? 6 : 4 }), [wide]);
  const budgets = useData((d) => budgetsForMonth(d, new Date()));
  const ratesAt = useData(lastRatesFetch);
  const lookups = useLookups();
  useAutoRates();
  const refreshControl = useSyncRefresh();

  const live = [...lookups.accounts.values()].filter((a) => !a.archived);
  const name = profile?.name?.trim() || "";
  const net = thisMonth ? thisMonth.income - thisMonth.expense : 0;
  const startOfMonth = nw.totalBase - net;
  const pct = startOfMonth > 0 ? (net / startOfMonth) * 100 : null;
  const up = net >= 0;
  const health = summarize(budgets, t, { short: true });
  // Wide screens have room for every budget this month (W01), most urgent first.
  const spotlight = [...budgets].sort((a, b) => b.pct - a.pct).slice(0, wide ? 5 : 2);
  const openAccount = (id: string) => router.push({ pathname: "/accounts/[id]", params: { id } });

  const change = (
    <Inline gap={8}>
      <Inline gap={4}>
        <Icon name={up ? "arrow-up-right" : "arrow-down-right"} color={up ? c.positiveText : c.negativeText} variant="xs" />
        <T variant="label" color={up ? c.positiveText : c.negativeText} num>
          {fmtMajor(net, nw.baseCurrency, { signDisplay: "always" })}
          {pct !== null ? ` (${Math.abs(pct).toFixed(1)}%)` : ""}
        </T>
      </Inline>
      <T variant="caption" color={c.mute}>
        {t.home.thisMonth}
      </T>
    </Inline>
  );
  const holdings =
    nw.byCurrency.length > 0 ? (
      <HScroll style={{ marginBottom: nw.byCurrency.length > 1 && !ratesAt ? 12 : wide ? 40 : 24 }}>
        {nw.byCurrency.map((b) => (
          <Chip key={b.currency} prefix={b.currency} label={fmtBare(b.amount, b.currency)} />
        ))}
      </HScroll>
    ) : null;
  const noRates =
    nw.byCurrency.length > 1 && !ratesAt ? (
      <T variant="caption" color={c.mute} style={{ marginBottom: wide ? 40 : 24 }}>
        {t.home.noRates}
      </T>
    ) : null;
  const quick = (
    <View style={[s.quick, wide ? { width: twoColumns ? 340 : "100%" } : { marginBottom: 8 }]}>
      <QuickAction icon="plus" label={t.common.add} href="/transaction" />
      <QuickAction icon="swap" label={t.common.transfer} href={{ pathname: "/transaction", params: { type: "transfer" } }} />
      <QuickAction icon="pie" label={t.tabs.budgets} href="/budgets" />
      <QuickAction icon="bar" label={t.tabs.trends} href="/analytics" />
    </View>
  );
  const noAccounts = (
    <Empty
      icon="wallet"
      title={t.common.noAccountsYet}
      body={t.home.noAccountsBody}
      action={<Button label={t.common.addAccount} icon="plus" onPress={() => router.push("/account-form")} style={{ alignSelf: "center" }} />}
    />
  );
  const budgetBars = spotlight.map((b, i) => {
    const cat = lookups.categories.get(b.categoryId);
    return (
      <Fragment key={b.id}>
        <Between style={{ marginTop: i === 0 ? 0 : wide ? 18 : 14, marginBottom: wide ? 8 : 6 }}>
          <T variant={wide ? "bodySm" : "caption"} color={wide ? c.text : c.mute} numberOfLines={1} style={{ flexShrink: 1 }}>
            {cat?.name ?? t.common.category}
          </T>
          <T variant={wide ? "bodySm" : "caption"} color={b.over ? c.negativeText : c.mute} num>
            {b.over ? t.home.overBy(fmtShort(-b.remaining, b.currency)) : `${Math.round(b.pct)}%`}
          </T>
        </Between>
        <ProgressBar pct={b.pct} color={b.over ? c.negative : resolveColor(budgetLook(b, cat).color)} />
      </Fragment>
    );
  });
  const recentRows =
    recent.length === 0 ? (
      <Empty title={t.common.noTransactionsYet} body={t.home.noTransactionsBody} />
    ) : (
      recent.map((t, i) => <TransactionRow key={t.id} t={t} lookups={lookups} last={i === recent.length - 1} />)
    );

  if (wide) {
    // W01: the hero on the canvas with the quick actions beside it, four
    // account cards, then recent activity next to the budgets.
    return (
      <Screen tabs refreshControl={refreshControl}>
        <T variant="title" numberOfLines={1} style={{ marginBottom: 28 }}>
          {name || "Pernce"}
        </T>
        <SyncBannerSlot />
        <View style={[s.hero, !twoColumns && { flexDirection: "column", alignItems: "stretch" }]}>
          <View>
            <T variant="caption" color={c.mute}>
              {t.home.totalNetWorth}
            </T>
            <T variant="displayLg" num numberOfLines={1} style={{ marginTop: 4, marginBottom: 8 }}>
              {fmtMajor(nw.totalBase, nw.baseCurrency)}
            </T>
            {change}
          </View>
          {quick}
        </View>
        <View style={{ height: 24 }} />
        {holdings}
        {noRates}
        <SectionHead title={t.tabs.accounts} onSeeAll={() => router.push("/accounts")} style={{ marginBottom: 16 }} />
        {live.length === 0 ? (
          noAccounts
        ) : (
          <Grid columns={twoColumns ? 4 : 2} style={{ marginBottom: 32 }}>
            {live.slice(0, 4).map((a) => (
              <Card key={a.id} onPress={() => openAccount(a.id)} style={{ flex: 1 }}>
                <Avatar color={a.color} label={a.name} icon={a.icon ?? undefined} size="sm" />
                <T variant="caption" color={c.mute} numberOfLines={1} style={{ marginTop: 16 }}>
                  {a.name}
                </T>
                <T variant="bodyBold" num numberOfLines={1}>
                  {fmtMinor(a.balance, a.currency)}
                </T>
              </Card>
            ))}
          </Grid>
        )}
        <Columns style={twoColumns ? { alignItems: "flex-start" } : null}>
          <Card style={s.wideCard}>
            <SectionHead title={t.home.recentActivity} onSeeAll={() => router.push("/activity")} style={{ marginBottom: 8 }} />
            {recentRows}
          </Card>
          {spotlight.length > 0 ? (
            <Card style={s.wideCard} onPress={() => router.push("/budgets")}>
              <Between style={{ marginBottom: 20 }}>
                <T variant="heading">{t.tabs.budgets}</T>
                <Status state={health.state} label={health.label} />
              </Between>
              {budgetBars}
            </Card>
          ) : null}
        </Columns>
      </Screen>
    );
  }

  return (
    <Screen tabs edges={["top"]} refreshControl={refreshControl}>
      {/* The avatar is the only way into Settings from Home. */}
      <Between style={{ marginTop: 8, marginBottom: 24 }}>
        <T variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name || "Pernce"}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel={t.common.settings} onPress={() => router.push("/settings")}>
          {profile ? <ProfileAvatar profile={profile} /> : null}
        </Pressable>
      </Between>
      <SyncBannerSlot />

      <T variant="caption" color={c.mute}>
        {t.home.totalNetWorth}
      </T>
      <T variant="display" num numberOfLines={1} style={{ marginTop: 4, marginBottom: 6 }}>
        {fmtMajor(nw.totalBase, nw.baseCurrency)}
      </T>
      <View style={{ marginBottom: 20 }}>{change}</View>

      {holdings}
      {noRates}

      {quick}

      <SectionHead title={t.tabs.accounts} onSeeAll={() => router.push("/accounts")} style={{ marginTop: 28, marginBottom: 12 }} />
      {live.length === 0 ? (
        noAccounts
      ) : (
        <HScroll>
          {live.map((a) => (
            <Card key={a.id} style={s.accountCard} onPress={() => openAccount(a.id)}>
              <Avatar color={a.color} label={a.name} icon={a.icon ?? undefined} size="sm" />
              <T variant="caption" color={c.mute} numberOfLines={1} style={{ marginTop: 16 }}>
                {a.name}
              </T>
              <T variant="bodyBold" num numberOfLines={1}>
                {fmtMinor(a.balance, a.currency)}
              </T>
            </Card>
          ))}
        </HScroll>
      )}

      {spotlight.length > 0 ? (
        <Card style={{ marginTop: 24 }} onPress={() => router.push("/budgets")}>
          <Between style={{ marginBottom: 12 }}>
            <T variant="bodyBold">{t.tabs.budgets}</T>
            <Status state={health.state} label={health.label} />
          </Between>
          {budgetBars}
        </Card>
      ) : null}

      <SectionHead title={t.home.recentActivity} onSeeAll={() => router.push("/activity")} style={{ marginTop: 28, marginBottom: 4 }} />
      {recentRows}
    </Screen>
  );
}

/** .qa: a 52px soft plate over a 12px label. */
function QuickAction({ icon, label, href }: { icon: string; label: string; href: Href }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} style={s.quickItem}>
      <IconButton icon={icon} label={label} px={52} />
      <T variant="caption" weight="500" color={c.mute} style={{ fontSize: 12, lineHeight: 17 }}>
        {label}
      </T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  accountCard: { width: 172 },
  hero: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 24 },
  wideCard: { padding: 32 },
  quick: { flexDirection: "row", gap: 8 },
  quickItem: { flex: 1, alignItems: "center", gap: 8 },
});
