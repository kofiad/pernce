import { budgetProgress, fromMinor, minorToInput, parseAmountInput, resolveColor } from "@pernce/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AmountField, CategoryGrid, CurrencyPicker } from "../components/inputs";
import { CATEGORY_COLOURS, CATEGORY_ICON_SUGGESTIONS, ColorRow, IconRow } from "../components/look";
import { Actions, Between, Button, Card, Chip, FieldLabel, FieldMessage, ProgressBar, Screen, T } from "../components/ui";
import { deleteBudget, lastBudgetLook, listBudgets, periodOf, setBudget } from "../data/budgets";
import { budgetLook } from "../data/look";
import { listCategories } from "../data/categories";
import { monthRange, spendRows } from "../data/reports";
import { db } from "../db/client";
import { monthYear, translateError } from "../i18n";
import { useData, useLookups } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { fmtShort } from "../lib/money";
import { useTheme } from "../lib/theme";
import { showAlert } from "../lib/alert";

/** M20 Budget form (sheet): one monthly limit per category, in any
 * currency. */
export default function BudgetForm() {
  const params = useLocalSearchParams<{ period?: string; categoryId?: string }>();
  const { c } = useTheme();
  const t = useT();
  const period = params.period ?? periodOf(new Date());
  const [y, m] = period.split("-").map(Number);
  const month = new Date(y, m - 1, 1);
  const { base, rates } = useLookups();
  const budgets = useData((d) => listBudgets(d, period), [period]);
  const categories = useData((d) => listCategories(d, { kind: "expense" }));
  const spend = useData((d) => spendRows(d, monthRange(month).from, monthRange(month).to), [period]);
  const existing = params.categoryId ? budgets.find((b) => b.categoryId === params.categoryId) : undefined;

  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [currency, setCurrency] = useState(existing?.currency ?? base);
  const [amount, setAmount] = useState(existing ? minorToInput(existing.amount, existing.currency) : "");
  const [error, setError] = useState<string | null>(null);
  // Look: the category's until "Custom" is picked.
  const [custom, setCustom] = useState(!!(existing?.color || existing?.icon));
  const [color, setColor] = useState<string | null>(existing?.color ?? null);
  const [icon, setIcon] = useState<string | null>(existing?.icon ?? null);
  const budgeted = new Set(budgets.map((b) => b.categoryId));
  const available = existing ? categories : categories.filter((x) => !budgeted.has(x.id));

  const parsed = parseAmountInput(amount, currency);
  const limit = parsed.error === null ? fromMinor(parsed.minor, currency) : 0;
  const category = categories.find((x) => x.id === categoryId);
  const look = budgetLook({ color, icon }, category);
  const progress = categoryId ? budgetProgress({ categoryId, amount: limit, currency }, spend, rates) : null;
  const current = periodOf(new Date()) === period;

  function save() {
    if (!categoryId) return setError(t.budgets.chooseCategory);
    if (parsed.error !== null) return setError(translateError(parsed.error, t));
    try {
      setBudget(db, {
        categoryId,
        period,
        amount: parsed.minor,
        currency,
        color: custom ? look.color : null,
        icon: custom ? look.icon : null,
      });
      router.back();
    } catch (e) {
      showAlert(t.common.couldntSave, translateError(e, t));
    }
  }

  return (
    <Screen sheet={existing ? t.budgets.edit : t.budgets.new}>
      <FieldLabel>{t.common.category}</FieldLabel>
      <CategoryGrid
        categories={available}
        value={categoryId}
        onChange={
          existing
            ? undefined
            : (id) => {
                setCategoryId(id);
                setError(null);
                // A new month's budget starts out looking like the last one.
                const last = lastBudgetLook(db, id, period);
                setCustom(!!(last.color || last.icon));
                setColor(last.color);
                setIcon(last.icon);
              }
        }
      />
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <CurrencyPicker
          value={currency}
          onChange={(next) => {
            setCurrency(next);
            setAmount("");
          }}
          style={{ width: 120 }}
        />
        <AmountField
          label={t.budgets.monthlyLimit}
          value={amount}
          onChange={(text) => {
            setAmount(text);
            setError(null);
          }}
          currency={currency}
          autoFocus={!!existing}
          style={{ flex: 1 }}
        />
      </View>
      {error ? (
        <View style={{ marginTop: -20, marginBottom: 20 }}>
          <FieldMessage error={error} />
        </View>
      ) : null}

      {progress && category ? (
        <Card inset style={{ marginBottom: 24 }}>
          <T variant="caption" color={c.mute} style={{ marginBottom: 8 }}>
            {current ? t.budgets.thisMonthSoFar : t.budgets.monthSoFar(monthYear(month, t))}
          </T>
          <Between style={{ marginBottom: 8 }}>
            <T variant="bodySm" numberOfLines={1} style={{ flexShrink: 1 }}>
              {category.name}
            </T>
            <T variant="bodySm" num>
              {fmtShort(progress.spent, currency)} / {fmtShort(limit, currency)}
            </T>
          </Between>
          <ProgressBar pct={limit > 0 ? progress.pct : 0} color={progress.over ? c.negative : resolveColor(look.color)} />
        </Card>
      ) : null}

      {category ? (
        <>
          <FieldLabel>{t.look.look}</FieldLabel>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            <Chip label={t.look.sameAsCategory} active={!custom} onPress={() => setCustom(false)} />
            <Chip label={t.look.custom} active={custom} onPress={() => setCustom(true)} />
          </View>
          {custom ? (
            <>
              <ColorRow value={look.color} onChange={setColor} presets={CATEGORY_COLOURS} icon={look.icon} />
              <IconRow value={look.icon} onChange={(next) => next && setIcon(next)} suggestions={CATEGORY_ICON_SUGGESTIONS} />
            </>
          ) : null}
        </>
      ) : null}

      <Actions>
        <Button label={t.budgets.save} onPress={save} />
        {existing ? (
          <Button
            label={t.budgets.remove}
            variant="danger"
            onPress={() => {
              deleteBudget(db, existing.id);
              router.back();
            }}
          />
        ) : null}
        <Button label={t.common.cancel} variant="text" onPress={() => router.back()} />
      </Actions>
    </Screen>
  );
}
