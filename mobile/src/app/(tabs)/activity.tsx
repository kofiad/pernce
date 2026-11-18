import { toLocalISODate, type TransactionType } from "@pernce/core";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChoiceSheet } from "../../components/inputs";
import { TransactionRow, TransactionTableHeader, TransactionTableRow } from "../../components/TransactionRow";
import {
  Between,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  FieldLabel,
  Grid,
  GroupLabel,
  HScroll,
  IconButton,
  ListRow,
  PageHeader,
  Screen,
  T,
  useTabClearance,
} from "../../components/ui";
import { incomeExpenseForRange } from "../../data/reports";
import { listTransactions, type TransactionFilters } from "../../data/transactions";
import type { Transaction } from "../../db/schema";
import { dayHeading } from "../../i18n";
import { useData, useLookups } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { fmtMajor } from "../../lib/money";
import { GUTTER, useTheme } from "../../lib/theme";
import { useSyncRefresh } from "../../lib/syncFeature";

const PAGE = 50;
type Range = "month" | "last-month" | "90d" | "all";
const RANGES: Range[] = ["month", "last-month", "90d", "all"];
/** A preset, or a period handed over by Insights (M07b), with its label. */
type Period = Range | { from: string; to?: string; label: string };

function rangeBounds(range: Period): { from?: string; to?: string } {
  if (typeof range === "object") return { from: range.from, to: range.to };
  const now = new Date();
  if (range === "month") return { from: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)) };
  if (range === "last-month") {
    return {
      from: toLocalISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    };
  }
  if (range === "90d") return { from: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)) };
  return {};
}

type Item = { kind: "day"; key: string; label: string; first: boolean } | { kind: "tx"; key: string; t: Transaction; last: boolean };

/** M07 Activity: a day-grouped ledger. Type, period, currency and account
 * filters combine. Insights opens it on one category's spending (M07b):
 * `category`, its `period` with `from` / `to`, and `at` so the same pick
 * applies again after it was cleared. */
export default function Activity() {
  const { c } = useTheme();
  const clearance = useTabClearance();
  const t = useT();
  const lookups = useLookups();
  const refreshControl = useSyncRefresh();
  const base = lookups.base;
  const [type, setType] = useState<TransactionType | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [range, setRange] = useState<Period>("month");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState<"period" | "filters" | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const { wide, nav } = useLayout();

  const params = useLocalSearchParams<{ category?: string; period?: string; from?: string; to?: string; at?: string }>();
  const [applied, setApplied] = useState<string | undefined>();
  if (params.at && params.category && params.at !== applied) {
    const insights = t.analytics.ranges as Record<string, string>;
    setApplied(params.at);
    setCategoryId(params.category);
    setRange(
      params.period === "month" || !params.from
        ? "month"
        : { from: params.from, to: params.to, label: insights[params.period ?? ""] ?? t.activity.period },
    );
    setType(null);
    setLimit(PAGE);
  }

  const bounds = rangeBounds(range);
  const filters: TransactionFilters = useMemo(
    () => ({
      type: type ?? undefined,
      accountId: accountId ?? undefined,
      currency: currency ?? undefined,
      categoryId: categoryId ?? undefined,
      search,
      ...rangeBounds(range),
      limit,
    }),
    [type, accountId, currency, categoryId, range, search, limit],
  );
  const rows = useData((d) => listTransactions(d, filters), [filters]);
  const totals = useData(
    (d) => incomeExpenseForRange(d, bounds.from, bounds.to, categoryId ?? undefined),
    [bounds.from, bounds.to, categoryId],
  );
  const net = totals.income - totals.expense;
  const liveAccounts = [...lookups.accounts.values()].filter((a) => !a.archived);
  const currencies = [...new Set(liveAccounts.map((a) => a.currency))];
  const reset = () => setLimit(PAGE);

  if (lookups.accounts.size === 0) {
    return (
      <Screen tabs edges={["top"]}>
        <PageHeader title={t.tabs.activity} />
        <Empty
          fill
          title={t.common.noTransactionsYet}
          body={t.common.addAccountFirst}
          action={<Button label={t.common.addAccount} icon="plus" onPress={() => router.push("/account-form")} style={{ alignSelf: "center" }} />}
        />
      </Screen>
    );
  }

  const items: Item[] = [];
  rows.forEach((tx, i) => {
    if (i === 0 || rows[i - 1].occurredAt !== tx.occurredAt) {
      items.push({ kind: "day", key: `d-${tx.occurredAt}`, label: dayHeading(tx.occurredAt, t), first: i === 0 });
    }
    items.push({ kind: "tx", key: tx.id, t: tx, last: i === rows.length - 1 });
  });

  const typeChip = (label: string, value: TransactionType | null) => (
    <Chip
      key={label}
      label={label}
      active={value !== null && type === value}
      onPress={() => {
        setType(type === value ? null : value);
        reset();
      }}
    />
  );

  const category = categoryId ? lookups.categories.get(categoryId) : undefined;
  const filterChips = (
    <>
      {categoryId ? (
        <Chip
          label={category?.name ?? t.common.uncategorized}
          active
          trailingIcon="x"
          onPress={() => {
            setCategoryId(null);
            reset();
          }}
        />
      ) : null}
      <Chip
        label={typeof range === "object" ? range.label : t.activity.ranges[range]}
        active
        trailingIcon="chevron-down"
        onPress={() => setSheet("period")}
      />
    </>
  );

  const sheets = (
    <>
      <ChoiceSheet visible={sheet === "period"} title={t.activity.period} onClose={() => setSheet(null)}>
        {RANGES.map((r, i) => (
          <ListRow
            key={r}
            title={t.activity.ranges[r]}
            right={r === range ? <T variant="label" color={c.link}>{t.activity.selected}</T> : null}
            onPress={() => {
              setRange(r);
              reset();
              setSheet(null);
            }}
            last={i === RANGES.length - 1}
          />
        ))}
      </ChoiceSheet>

      <ChoiceSheet visible={sheet === "filters"} title={t.activity.filters} onClose={() => setSheet(null)}>
        {currencies.length > 1 ? (
          <View style={{ marginBottom: 20 }}>
            <FieldLabel>{t.common.currency}</FieldLabel>
            <View style={s.wrap}>
              {currencies.map((cur) => (
                <Chip
                  key={cur}
                  label={cur}
                  active={currency === cur}
                  onPress={() => {
                    setCurrency(currency === cur ? null : cur);
                    reset();
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
        <FieldLabel>{t.common.account}</FieldLabel>
        <View style={[s.wrap, { marginBottom: 24 }]}>
          {liveAccounts.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              active={accountId === a.id}
              onPress={() => {
                setAccountId(accountId === a.id ? null : a.id);
                reset();
              }}
            />
          ))}
        </View>
        <Button
          label={t.activity.clearFilters}
          variant="soft"
          onPress={() => {
            setAccountId(null);
            setCurrency(null);
            reset();
            setSheet(null);
          }}
        />
      </ChoiceSheet>
    </>
  );

  if (wide) {
    // W04: the search stays open, the totals are cards, and from 1024 the
    // ledger is a table (description, category, account, converted, amount).
    const table = nav === "side";
    return (
      <Screen tabs refreshControl={refreshControl}>
        <PageHeader
          title={t.tabs.activity}
          right={
            <>
              <Field
                placeholder={t.activity.searchNotes}
                lead="search"
                value={search}
                onChangeText={(text) => {
                  setSearch(text);
                  reset();
                }}
                containerStyle={{ marginBottom: 0, width: 320 }}
              />
              <IconButton
                icon="filter"
                size="sm"
                variant={accountId || currency ? "selected" : "soft"}
                label={t.activity.filters}
                onPress={() => setSheet("filters")}
              />
            </>
          }
        />
        <HScroll style={{ marginBottom: 24 }}>
          {filterChips}
          {typeChip(t.activity.allTypes, null)}
          {typeChip(t.common.income, "income")}
          {typeChip(t.activity.expenses, "expense")}
          {typeChip(t.activity.transfers, "transfer")}
        </HScroll>
        <Grid columns={3} style={{ marginBottom: 24 }}>
          <Card>
            <Kpi label={t.common.moneyIn} value={fmtMajor(totals.income, base)} color={c.positiveText} large />
          </Card>
          <Card>
            <Kpi label={t.common.moneyOut} value={fmtMajor(totals.expense, base)} large />
          </Card>
          <Card>
            <Kpi
              label={t.common.net}
              value={fmtMajor(net, base, { signDisplay: "exceptZero" })}
              color={net > 0 ? c.positiveText : net < 0 ? c.negativeText : undefined}
              large
            />
          </Card>
        </Grid>
        <Card style={{ padding: 32 }}>
          {rows.length === 0 ? (
            <Empty title={t.activity.nothingHere} body={t.activity.noMatches} />
          ) : (
            <>
              {table ? <TransactionTableHeader /> : null}
              {items.map((item) =>
                item.kind === "day" ? (
                  <GroupLabel key={item.key} first={item.first} style={table ? { paddingHorizontal: 12, marginTop: 20 } : null}>
                    {item.label}
                  </GroupLabel>
                ) : table ? (
                  <TransactionTableRow key={item.key} t={item.t} lookups={lookups} last={item.last} />
                ) : (
                  <TransactionRow key={item.key} t={item.t} lookups={lookups} last={item.last} />
                ),
              )}
            </>
          )}
        </Card>
        {rows.length >= limit ? (
          <Button label={t.accounts.showMore} variant="outline" small onPress={() => setLimit(limit + PAGE)} style={{ alignSelf: "center", marginTop: 24 }} />
        ) : null}
        {sheets}
      </Screen>
    );
  }

  const header = (
    <View>
      <PageHeader
        title={t.tabs.activity}
        right={
          <>
            <IconButton
              icon="search"
              size="sm"
              variant={searching ? "selected" : "soft"}
              label={t.activity.search}
              onPress={() => {
                if (searching) setSearch("");
                setSearching(!searching);
              }}
            />
            <IconButton
              icon="filter"
              size="sm"
              variant={accountId || currency ? "selected" : "soft"}
              label={t.activity.filters}
              onPress={() => setSheet("filters")}
            />
          </>
        }
      />

      {searching ? (
        <Field
          placeholder={t.activity.searchNotes}
          lead="search"
          value={search}
          autoFocus
          onChangeText={(text) => {
            setSearch(text);
            reset();
          }}
          clearButtonMode="while-editing"
          containerStyle={{ marginBottom: 16 }}
        />
      ) : null}

      <HScroll style={{ marginBottom: 16 }}>
        {filterChips}
        {typeChip(t.activity.allTypes, null)}
        {typeChip(t.common.income, "income")}
        {typeChip(t.activity.expenses, "expense")}
        {typeChip(t.activity.transfers, "transfer")}
      </HScroll>

      <Card style={{ marginBottom: 4 }}>
        <Between>
          <Kpi label={t.common.moneyIn} value={fmtMajor(totals.income, base)} color={c.positiveText} />
          <Kpi label={t.common.moneyOut} value={fmtMajor(totals.expense, base)} />
          <Kpi label={t.common.net} value={fmtMajor(net, base, { signDisplay: "exceptZero" })} color={net > 0 ? c.positiveText : net < 0 ? c.negativeText : undefined} />
        </Between>
      </Card>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.canvas }}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[s.list, { paddingBottom: clearance }]}
        ListHeaderComponent={header}
        renderItem={({ item }) =>
          item.kind === "day" ? (
            <GroupLabel first={item.first}>{item.label}</GroupLabel>
          ) : (
            <TransactionRow t={item.t} lookups={lookups} last={item.last} />
          )
        }
        onEndReached={() => {
          if (rows.length >= limit) setLimit(limit + PAGE);
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<Empty title={t.activity.nothingHere} body={t.activity.noMatches} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      />

      {sheets}
    </SafeAreaView>
  );
}

/** .kpi: a muted caption over a bold figure. */
function Kpi({ label, value, color, large }: { label: string; value: string; color?: string; large?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexShrink: 1 }}>
      <T variant="caption" color={c.mute}>
        {label}
      </T>
      <T variant={large ? "headingMd" : "bodyBold"} color={color} num numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

const s = StyleSheet.create({
  list: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
