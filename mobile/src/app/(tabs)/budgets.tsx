import { resolveColor } from "@pernce/core";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  Avatar,
  Between,
  Button,
  Card,
  Empty,
  Grid,
  IconButton,
  Inline,
  ProgressBar,
  Screen,
  Status,
  T,
} from "../../components/ui";
import { InsightsHeader } from "../../components/InsightsHeader";
import { budgetsForMonth, copyPreviousMonthBudgets, periodOf, type BudgetWithProgress } from "../../data/budgets";
import { budgetLook } from "../../data/look";
import { db } from "../../db/client";
import { healthOf, statusLabel, summarize } from "../../lib/budgetHealth";
import { monthYear, type Messages } from "../../i18n";
import { useData, useLookups } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useLayout } from "../../lib/layout";
import { fmtShort as short } from "../../lib/money";
import { useTheme } from "../../lib/theme";
import { showAlert } from "../../lib/alert";

/** "GHS 1,542.50 / 2,000" — the limit keeps a symbol but drops a code. */
function spentOf(b: BudgetWithProgress) {
  const limitText = short(b.spent + b.remaining, b.currency);
  return `${short(b.spent, b.currency)} / ${limitText.startsWith(`${b.currency} `) ? limitText.slice(b.currency.length + 1) : limitText}`;
}

function periodNote(month: Date, t: Messages) {
  const now = new Date();
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today >= end) return t.budgets.ended;
  if (today < start) return t.budgets.startsIn(Math.round((start.getTime() - today.getTime()) / 86_400_000));
  const left = Math.round((end.getTime() - today.getTime()) / 86_400_000) - 1;
  return left === 0 ? t.budgets.lastDay : t.budgets.daysLeft(left);
}

/** A column of cards on a phone; a grid of `columns` on a wide screen (W05). */
function BudgetCards({ columns, children }: { columns: number; children: ReactNode }) {
  if (columns) return <Grid columns={columns}>{children}</Grid>;
  return <View style={{ gap: 12 }}>{children}</View>;
}

/** M09 Insights — Budgets: monthly periods. Over-budget cards take a danger
 * hairline; status is a dot and text, never colour alone. */
export default function Budgets() {
  const { c } = useTheme();
  const t = useT();
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const period = periodOf(month);
  const budgets = useData((d) => budgetsForMonth(d, month), [period]);
  const { categories } = useLookups();
  const health = summarize(budgets, t);
  const { wide, twoColumns } = useLayout();

  function copyLast() {
    const n = copyPreviousMonthBudgets(db, period);
    if (n === 0) showAlert(t.budgets.nothingToCopy, t.budgets.nothingToCopyBody);
  }
  const add = () => router.push({ pathname: "/budget-form", params: { period } });
  const stepper = (
    <>
      <IconButton icon="chevron-left" size="sm" label={t.budgets.previousMonth} onPress={() => setOffset(offset - 1)} />
      <T variant="label" align="center" style={wide ? { minWidth: 132 } : null}>
        {monthYear(month, t)}
      </T>
      <IconButton icon="chevron-right" size="sm" label={t.budgets.nextMonth} onPress={() => setOffset(offset + 1)} />
    </>
  );

  return (
    <Screen tabs edges={["top"]}>
      <InsightsHeader
        segment="budgets"
        right={
          wide ? (
            <>
              {stepper}
              <Button label={t.budgets.new} icon="plus" onPress={add} />
            </>
          ) : (
            <IconButton icon="plus" size="sm" variant="brand" label={t.budgets.new} onPress={add} />
          )
        }
      />
      {wide ? null : <Between style={{ marginBottom: 16 }}>{stepper}</Between>}

      {budgets.length === 0 ? (
        <Empty
          icon="pie"
          title={t.budgets.emptyTitle}
          body={t.budgets.emptyBody}
          action={
            <View style={{ gap: 12, alignItems: "center" }}>
              <Button label={t.budgets.add} icon="plus" onPress={add} />
              <Button label={t.budgets.copyLast} variant="text" onPress={copyLast} />
            </View>
          }
        />
      ) : (
        <>
          <Card style={{ marginBottom: wide ? 24 : 16 }}>
            <Between style={{ marginBottom: 6 }}>
              <T variant="bodyBold">
                {t.budgets.count(budgets.length)}
              </T>
              <Status state={health.state} label={health.label} />
            </Between>
            <T variant="caption" color={c.mute}>
              {periodNote(month, t)}
            </T>
          </Card>

          <BudgetCards columns={wide ? (twoColumns ? 3 : 2) : 0}>
            {budgets.map((b) => {
              const cat = categories.get(b.categoryId);
              const look = budgetLook(b, cat);
              return (
                <Card
                  key={b.id}
                  style={b.over ? { borderColor: c.negative } : null}
                  onPress={() => router.push({ pathname: "/budgets/[categoryId]", params: { categoryId: b.categoryId, period } })}
                >
                  <Between style={{ marginBottom: 12 }}>
                    <Inline style={{ flexShrink: 1 }}>
                      <Avatar color={look.color} icon={look.icon} size="sm" />
                      <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {cat?.name ?? t.common.category}
                      </T>
                    </Inline>
                    <T variant="caption" color={c.mute} num>
                      {spentOf(b)}
                    </T>
                  </Between>
                  <ProgressBar pct={b.pct} color={b.over ? c.negative : resolveColor(look.color)} />
                  <Between style={{ marginTop: 10 }}>
                    <Status state={healthOf(b)} label={statusLabel(b, t)} />
                    <T variant="caption" color={c.stone} num>
                      {Math.round(b.pct)}%
                    </T>
                  </Between>
                </Card>
              );
            })}
          </BudgetCards>
        </>
      )}
    </Screen>
  );
}
