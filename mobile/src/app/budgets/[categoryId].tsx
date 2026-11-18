import { resolveColor } from "@pernce/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { TransactionRow } from "../../components/TransactionRow";
import {
  Avatar,
  Between,
  Button,
  Card,
  Columns,
  Crumb,
  Empty,
  GroupLabel,
  IconButton,
  NavHeader,
  ProgressBar,
  Screen,
  Status,
  T,
} from "../../components/ui";
import { budgetExpenses, budgetFor, periodOf } from "../../data/budgets";
import { budgetLook } from "../../data/look";
import { monthYear } from "../../i18n";
import { healthOf, statusLabel } from "../../lib/budgetHealth";
import { useData, useLookups } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { fmtMajor } from "../../lib/money";
import { useTheme } from "../../lib/theme";

/** M09a Budget detail: one category's budget for a month and the expenses
 * that count towards it. The month row steps through months for the same
 * category; a month without a budget still lists its spending. On a wide
 * screen (W08) the expenses sit beside the summary card. */
export default function BudgetDetail() {
  const params = useLocalSearchParams<{ categoryId: string; period?: string }>();
  const categoryId = params.categoryId;
  const { c } = useTheme();
  const t = useT();
  const [period, setPeriod] = useState(params.period ?? periodOf(new Date()));
  const [limit, setLimit] = useState(20);
  const [y, m] = period.split("-").map(Number);
  const month = new Date(y, m - 1, 1);
  const budget = useData((d) => budgetFor(d, categoryId, month), [categoryId, period]);
  const rows = useData((d) => budgetExpenses(d, categoryId, month), [categoryId, period]);
  const lookups = useLookups();
  const category = lookups.categories.get(categoryId);
  const { wide } = useLayout();

  if (!category) {
    return (
      <Screen>
        <NavHeader />
        <Empty icon="pie" title={t.common.category} fill />
      </Screen>
    );
  }

  const shown = rows.slice(0, limit);
  const look = budgetLook(budget, category);
  const step = (n: number) => {
    setPeriod(periodOf(new Date(y, m - 1 + n, 1)));
    setLimit(20);
  };
  const edit = () => router.push({ pathname: "/budget-form", params: { period, categoryId } });

  const stepper = (
    <>
      <IconButton icon="chevron-left" size="sm" label={t.budgets.previousMonth} onPress={() => step(-1)} />
      <T variant="label" align="center" style={wide ? { minWidth: 132 } : null}>
        {monthYear(month, t)}
      </T>
      <IconButton icon="chevron-right" size="sm" label={t.budgets.nextMonth} onPress={() => step(1)} />
    </>
  );
  // On a wide screen the avatar moves up beside the title.
  const summary = budget ? (
    <Card style={[wide ? { padding: 32 } : { marginBottom: 8 }, budget.over ? { borderColor: c.negative } : null]}>
      <View style={s.hero}>
        {wide ? null : <Avatar color={look.color} icon={look.icon} size="lg" />}
        <T variant="display" num numberOfLines={1} style={wide ? null : { marginTop: 10 }}>
          {fmtMajor(budget.spent, budget.currency)}
        </T>
        <T variant="bodySm" color={c.stone} num align="center">
          {t.budgets.spentOf(fmtMajor(budget.spent + budget.remaining, budget.currency))}
        </T>
      </View>
      <ProgressBar pct={budget.pct} color={budget.over ? c.negative : resolveColor(look.color)} />
      <Between style={{ marginTop: 10 }}>
        <Status state={healthOf(budget)} label={statusLabel(budget, t)} />
        <T variant="caption" color={c.stone} num>
          {Math.round(budget.pct)}%
        </T>
      </Between>
    </Card>
  ) : (
    <Card inset style={[s.hero, wide ? { padding: 32 } : { marginBottom: 8 }]}>
      <Avatar color={category.color} icon={category.icon} size="lg" />
      <T variant="bodyBold" align="center" style={{ marginTop: 10 }}>
        {t.budgets.noBudgetFor(monthYear(month, t))}
      </T>
      <T variant="caption" color={c.mute} align="center">
        {t.budgets.noBudgetBody}
      </T>
      <Button label={t.budgets.setBudget} icon="plus" small onPress={edit} style={{ alignSelf: "center", marginTop: 12 }} />
    </Card>
  );
  const expenses =
    shown.length === 0 ? (
      <T variant="bodySm" color={c.mute} style={{ paddingVertical: 12 }}>
        {t.budgets.noExpenses}
      </T>
    ) : (
      shown.map((tx, i) => <TransactionRow key={tx.id} t={tx} lookups={lookups} last={i === shown.length - 1} />)
    );
  const more =
    rows.length > limit ? (
      <Button
        label={t.accounts.showMore}
        variant={wide ? "outline" : "soft"}
        small={wide}
        onPress={() => setLimit(limit + 20)}
        style={wide ? { alignSelf: "flex-start", marginTop: 20 } : { marginTop: 20 }}
      />
    ) : null;

  if (wide) {
    return (
      <Screen>
        <Crumb parent={{ label: t.tabs.insights, href: "/budgets" }} title={category.name} />
        <Between style={{ marginBottom: 28, flexWrap: "wrap" }}>
          <View style={[s.inline, { gap: 16, flexShrink: 1 }]}>
            <Avatar color={look.color} icon={look.icon} size="lg" />
            <T variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
              {category.name}
            </T>
          </View>
          <View style={[s.inline, { gap: 10 }]}>
            {stepper}
            {budget ? <Button label={t.common.edit} icon="edit" variant="soft" onPress={edit} /> : null}
          </View>
        </Between>
        <Columns split="side" style={{ alignItems: "flex-start" }}>
          <Card style={{ padding: 32 }}>
            <T variant="heading" style={{ marginBottom: 8 }}>
              {t.budgets.expenseCount(rows.length)}
            </T>
            {expenses}
            {more}
          </Card>
          {summary}
        </Columns>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavHeader
        title={category.name}
        right={budget ? <IconButton icon="edit" size="sm" variant="ghost" iconVariant="md" label={t.budgets.edit} onPress={edit} /> : null}
      />
      <Between style={{ marginBottom: 16 }}>{stepper}</Between>

      {summary}

      <GroupLabel>{t.budgets.expenseCount(rows.length)}</GroupLabel>
      {expenses}
      {more}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: "center", gap: 4, marginBottom: 16 },
  inline: { flexDirection: "row", alignItems: "center" },
});
