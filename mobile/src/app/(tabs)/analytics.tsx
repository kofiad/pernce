import { colors, resolveColor, toLocalISODate } from "@pernce/core";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { DonutPicker, ExposureBar, LineKey, Trend, type Slice } from "../../components/charts";
import { InsightsHeader } from "../../components/InsightsHeader";
import { Between, Card, Chip, Columns, Grid, HScroll, Inline, Screen, T } from "../../components/ui";
import {
  categorySpendForRange,
  incomeExpenseForRange,
  monthToDateFor,
  monthlySeriesFor,
  netWorth,
  netWorthTrendFor,
} from "../../data/reports";
import { monthShort, monthYear, shortDate, type Messages } from "../../i18n";
import { useData } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { fmtMajor, fmtShort } from "../../lib/money";
import { useTheme } from "../../lib/theme";

type Range = "month" | "3m" | "6m" | "year";
const RANGES: Range[] = ["month", "3m", "6m", "year"];

/** [from, to) and how many months that spans, ending with this month. */
function bounds(range: Range) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const months = range === "month" ? 1 : range === "3m" ? 3 : range === "6m" ? 6 : m + 1;
  return { from: toLocalISODate(new Date(y, m - months + 1, 1)), to: toLocalISODate(new Date(y, m + 1, 1)), months };
}

/** M10b → M07b: a category's spending in Activity, over the same period.
 * `at` makes a repeat pick apply again after Activity's chip was cleared. */
function openCategory(category: string, period: Range, from: string, to: string) {
  router.navigate({ pathname: "/activity", params: { category, period, from, to, at: String(Date.now()) } });
}

const EXPOSURE_COLORS = [
  colors.primary,
  colors["accent-teal"],
  colors["accent-pink"],
  colors["accent-yellow"],
  colors["accent-warning"],
  colors["accent-light-blue"],
  colors["accent-brown"],
  colors["accent-violet"],
];

/** "5+ years", "3 years", "8 months". */
function runway(months: number, t: Messages) {
  if (months >= 60) return t.analytics.runwayFivePlus;
  if (months >= 12) return t.analytics.years(Math.floor(months / 12));
  const n = Math.floor(months);
  return n < 1 ? t.analytics.lessThanMonth : t.analytics.months(n);
}

/** What the two trends plot: day by day through today for a single month
 * (running totals for in/out, the axis spanning the whole month), else one
 * point per month. */
function useTrends(months: number, t: Messages) {
  const daily = months === 1;
  const mtd = useData((d) => (daily ? monthToDateFor(d) : []), [daily]);
  const monthly = useData((d) => (daily ? [] : monthlySeriesFor(d, months)), [daily, months]);
  const nwMonthly = useData((d) => (daily ? [] : netWorthTrendFor(d, months)), [daily, months]);

  if (daily) {
    const now = new Date();
    const dayOf = (i: number) => new Date(now.getFullYear(), now.getMonth(), i + 1);
    const upTo = (i: number) => (i === 0 ? shortDate(dayOf(0), t) : t.analytics.dayRange(monthShort(now, t), 1, i + 1));
    const slots = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const span = upTo(Math.max(0, mtd.length - 1));
    return {
      income: mtd.map((p) => p.income),
      expense: mtd.map((p) => p.expense),
      netWorth: mtd.map((p) => p.netWorth),
      slots,
      axis: [0, 7, 14, 21, 28].filter((i) => i < slots).map((i): [number, string] => [i, i === 0 ? shortDate(dayOf(0), t) : String(i + 1)]),
      inOutTitle: upTo,
      netWorthTitle: (i: number) => shortDate(dayOf(i), t),
      inOutCaption: t.analytics.runningTotal(span),
      netWorthCaption: t.analytics.daily(span),
    };
  }
  // At most six month labels, counted back from this month.
  const step = Math.ceil(months / 6);
  const month = (i: number) => monthly[i].month;
  const span = monthly.length > 1 ? `${monthShort(month(0), t)}–${monthShort(month(monthly.length - 1), t)}` : monthYear(month(0), t);
  return {
    income: monthly.map((m) => m.income),
    expense: monthly.map((m) => m.expense),
    netWorth: nwMonthly.map((p) => p.value),
    slots: months,
    axis: monthly.flatMap((m, i): [number, string][] => ((months - 1 - i) % step === 0 ? [[i, monthShort(m.month, t)]] : [])),
    inOutTitle: (i: number) => monthYear(month(i), t),
    netWorthTitle: (i: number) => monthYear(month(i), t),
    inOutCaption: t.analytics.perMonthOver(span),
    netWorthCaption: t.analytics.monthly(span),
  };
}

/** M10 Insights — Trends: everything is computed live from transactions. */
export default function Analytics() {
  const { c } = useTheme();
  const t = useT();
  const [range, setRange] = useState<Range>("month");
  const [picked, setPicked] = useState<number | null>(null);
  const { from, to, months } = bounds(range);
  const nw = useData(netWorth);
  const base = nw.baseCurrency;
  const totals = useData((d) => incomeExpenseForRange(d, from, to), [from, to]);
  const spend = useData((d) => categorySpendForRange(d, from, to), [from, to]);
  const trends = useTrends(months, t);
  const saved = totals.income > 0 ? ((totals.income - totals.expense) / totals.income) * 100 : null;

  // Six slices at most; the rest share one.
  const top = spend.slice(0, spend.length > 6 ? 5 : 6);
  const rest = spend.slice(top.length);
  const restPct = rest.reduce((s, e) => s + e.pct, 0);
  const slices: Slice[] = [
    ...top.map((e) => {
      const id = e.category?.id;
      return {
        key: id ?? "uncategorized",
        label: e.category?.name ?? t.common.uncategorized,
        color: resolveColor(e.category?.color ?? "stone"),
        pct: e.pct,
        amount: fmtMajor(e.amountBase, base),
        onOpen: id ? () => openCategory(id, range, from, to) : undefined,
      };
    }),
    ...(restPct > 0
      ? [
          {
            key: "rest",
            label: t.common.other,
            color: colors.stone,
            pct: restPct,
            amount: fmtMajor(rest.reduce((s, e) => s + e.amountBase, 0), base),
          },
        ]
      : []),
  ];
  const pick = picked !== null && picked < slices.length ? picked : null;

  const exposureTotal = nw.byCurrency.reduce((s, b) => s + Math.max(0, b.amountBase), 0);
  const exposure: Slice[] = [...nw.byCurrency]
    .sort((a, b) => b.amountBase - a.amountBase)
    .map((b, i) => ({
      key: b.currency,
      label: b.currency,
      amount: fmtMajor(b.amountBase, base),
      pct: exposureTotal > 0 ? (Math.max(0, b.amountBase) / exposureTotal) * 100 : 0,
      color: EXPOSURE_COLORS[i % EXPOSURE_COLORS.length],
    }));

  const values = trends.netWorth;
  const first = values[0] ?? 0;
  const change = values.length > 1 && first !== 0 ? ((values[values.length - 1] - first) / Math.abs(first)) * 100 : null;
  const net = totals.income - totals.expense;
  const pace = totals.expense / months;
  const { twoColumns } = useLayout();

  const ranges = (
    <HScroll style={{ marginBottom: twoColumns ? 24 : 16 }}>
      {RANGES.map((r) => (
        <Chip
          key={r}
          label={t.analytics.ranges[r]}
          active={range === r}
          onPress={() => {
            setRange(r);
            setPicked(null);
          }}
        />
      ))}
    </HScroll>
  );
  // A tap anywhere else on the card lets a picked slice go.
  const spending = (
    <View onStartShouldSetResponder={() => pick !== null} onResponderRelease={() => setPicked(null)}>
      <T variant="bodyBold" style={{ marginBottom: twoColumns ? 24 : 16 }}>
        {t.analytics.whereMoneyWent}
      </T>
      {slices.length === 0 ? (
        <T variant="caption" color={c.mute}>
          {t.analytics.noSpending}
        </T>
      ) : (
        <DonutPicker
          parts={slices}
          size={twoColumns ? 172 : 120}
          stroke={twoColumns ? 20 : 14}
          gap={twoColumns ? 32 : 20}
          picked={pick}
          onPick={setPicked}
          label={t.analytics.whereMoneyWent}
        />
      )}
    </View>
  );
  const inOut = (
    <>
      <Between>
        <T variant="bodyBold">{t.analytics.inVsOut}</T>
        <T variant="label" color={net >= 0 ? c.positiveText : c.negativeText} num>
          {t.analytics.netAmount(fmtShort(Math.round(net), base, { signDisplay: "exceptZero" }))}
        </T>
      </Between>
      <T variant="caption" color={c.mute} style={{ marginTop: 2, marginBottom: twoColumns ? 16 : 12 }}>
        {trends.inOutCaption}
      </T>
      <Trend
        series={[
          { name: t.analytics.in, color: c.primary, values: trends.income },
          { name: t.analytics.out, color: c.stone, values: trends.expense },
        ]}
        currency={base}
        slots={trends.slots}
        axis={trends.axis}
        title={trends.inOutTitle}
        extra={(i) => [[fmtMajor(trends.income[i] - trends.expense[i], base, { signDisplay: "exceptZero" }), t.analytics.net]]}
        label={t.analytics.inVsOut}
        height={twoColumns ? 180 : undefined}
      />
      <Inline gap={16} style={{ marginTop: 8 }}>
        <Inline gap={6}>
          <LineKey color={c.primary} />
          <T variant="caption" color={c.mute}>
            {t.analytics.in}
          </T>
        </Inline>
        <Inline gap={6}>
          <LineKey color={c.stone} />
          <T variant="caption" color={c.mute}>
            {t.analytics.out}
          </T>
        </Inline>
      </Inline>
    </>
  );
  const netWorthChart = (
    <>
      <Between>
        <T variant="bodyBold">{t.analytics.netWorth}</T>
        {change !== null ? (
          <T variant="label" color={change >= 0 ? c.positiveText : c.negativeText} num>
            {change >= 0 ? "+" : "−"}
            {Math.abs(change).toFixed(1)}%
          </T>
        ) : null}
      </Between>
      <T variant="caption" color={c.mute} style={{ marginTop: 2, marginBottom: twoColumns ? 16 : 12 }}>
        {trends.netWorthCaption}
      </T>
      <Trend
        series={[{ name: t.analytics.netWorth, color: c.primary, values }]}
        currency={base}
        fit
        slots={trends.slots}
        axis={trends.axis}
        title={trends.netWorthTitle}
        label={t.analytics.netWorth}
        height={twoColumns ? 180 : undefined}
      />
    </>
  );
  const currencies = (
    <>
      <T variant="bodyBold" style={{ marginBottom: 4 }}>
        {t.analytics.currenciesHeld}
      </T>
      <T variant="caption" color={c.mute} style={{ marginBottom: twoColumns ? 20 : 14 }}>
        {t.analytics.currenciesHeldBody}
      </T>
      {exposure.length === 0 ? (
        <T variant="caption" color={c.mute}>
          {t.analytics.noAccounts}
        </T>
      ) : (
        <ExposureBar parts={exposure} />
      )}
    </>
  );
  const savedText = saved === null ? "—" : `${saved.toFixed(1)}%`;

  if (twoColumns) {
    // W06: the figures (pace joins them), then the two trends side by side,
    // then the two breakdowns.
    const card = { padding: 32, flex: 1 };
    return (
      <Screen tabs>
        <InsightsHeader segment="analytics" />
        {ranges}
        <Grid columns={4} style={{ marginBottom: 24 }}>
          <Kpi label={t.common.moneyIn} value={fmtShort(Math.round(totals.income), base)} color={c.positiveText} large />
          <Kpi label={t.common.moneyOut} value={fmtShort(Math.round(totals.expense), base)} large />
          <Kpi label={t.analytics.saved} value={savedText} large />
          <Kpi
            label={t.analytics.monthlyPace}
            value={fmtShort(Math.round(pace), base)}
            unit={t.analytics.perMonth}
            note={pace > 0 ? t.analytics.paceShort(runway(nw.totalBase / pace, t)) : undefined}
            large
          />
        </Grid>
        <Columns split="even" style={{ marginBottom: 24 }}>
          <Card style={card}>{inOut}</Card>
          <Card style={card}>{netWorthChart}</Card>
        </Columns>
        <Columns split="even">
          <Card style={card}>{spending}</Card>
          <Card style={card}>{currencies}</Card>
        </Columns>
      </Screen>
    );
  }

  return (
    <Screen tabs edges={["top"]}>
      <InsightsHeader segment="analytics" />
      {ranges}

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <Kpi label={t.common.moneyIn} value={fmtShort(Math.round(totals.income), base)} color={c.positiveText} />
        <Kpi label={t.common.moneyOut} value={fmtShort(Math.round(totals.expense), base)} />
        <Kpi label={t.analytics.saved} value={savedText} />
      </View>

      <Card style={{ marginBottom: 16 }}>{spending}</Card>
      <Card style={{ marginBottom: 16 }}>{inOut}</Card>
      <Card style={{ marginBottom: 16 }}>{netWorthChart}</Card>
      <Card style={{ marginBottom: 16 }}>{currencies}</Card>

      <Card>
        <T variant="bodyBold" style={{ marginBottom: 4 }}>
          {t.analytics.monthlyPace}
        </T>
        <T variant="headingMd" num style={{ marginVertical: 6 }}>
          {fmtShort(Math.round(pace), base)}{" "}
          <T variant="bodySm" color={c.mute}>
            {t.analytics.perMonth}
          </T>
        </T>
        <T variant="bodySm" color={c.mute}>
          {pace > 0
            ? t.analytics.paceBody(runway(nw.totalBase / pace, t))
            : t.analytics.noSpendingYet}
        </T>
      </Card>
    </Screen>
  );
}

/** .card.kpi with 14px padding; `large` is the wide grid's (W06), with an
 * optional unit and note. */
function Kpi({ label, value, color, unit, note, large }: { label: string; value: string; color?: string; unit?: string; note?: string; large?: boolean }) {
  const { c } = useTheme();
  return (
    <Card style={large ? { flex: 1 } : { flex: 1, padding: 14 }}>
      <T variant="caption" color={c.mute}>
        {label}
      </T>
      <T variant={large ? "headingMd" : "bodyBold"} color={color} num numberOfLines={1}>
        {value}
        {unit ? (
          <T variant="bodySm" color={c.mute}>
            {" "}
            {unit}
          </T>
        ) : null}
      </T>
      {note ? (
        <T variant="caption" color={c.stone} numberOfLines={1}>
          {note}
        </T>
      ) : null}
    </Card>
  );
}
