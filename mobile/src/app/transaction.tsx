import {
  currencyDecimals,
  fromMinor,
  minorToInput,
  parseAmountInput,
  resolveColor,
  roundToCurrency,
  toBaseCurrency,
  toLocalISODate,
  type TransactionType,
} from "@pernce/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { AccountPicker, AmountField, CategoryRail, DateField } from "../components/inputs";
import {
  Actions,
  Badge,
  Between,
  Button,
  Card,
  ConfirmDialog,
  ErrorCard,
  Field,
  FieldLabel,
  FieldMessage,
  IconButton,
  InputBox,
  Link,
  ProgressBar,
  Screen,
  Segmented,
  T,
  styles as ui,
  text,
} from "../components/ui";
import { listAccounts } from "../data/accounts";
import { budgetsForMonth } from "../data/budgets";
import { listCategories } from "../data/categories";
import { getMeta, setMeta } from "../data/meta";
import { createTransaction, deleteTransaction, getTransaction, updateTransaction, type TransactionDraft } from "../data/transactions";
import { db } from "../db/client";
import { translateError } from "../i18n";
import { useData, useLookups } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useLayout } from "../lib/layout";
import { fmtMajor, fmtMinor, fmtShort } from "../lib/money";
import { useTheme } from "../lib/theme";
import { showAlert } from "../lib/alert";

/** Up to 6 significant digits, no trailing zeros: 14.6, 0.0685. */
const fmtRate = (n: number) => String(Number(n.toPrecision(6)));

/** M15–M19 New / edit transaction (sheet). A transfer between currencies
 * takes the amount received or the rate used (core derives the other),
 * and an optional fee from the sending account. */
export default function TransactionScreen() {
  const params = useLocalSearchParams<{ id?: string; type?: TransactionType; accountId?: string }>();
  const { c } = useTheme();
  const { wide } = useLayout();
  const t = useT();
  const { base, rates } = useLookups();
  const existing = useData((d) => (params.id ? getTransaction(d, params.id) : null), [params.id]);
  const accounts = useData((d) => listAccounts(d, { includeArchived: true }));
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === existing?.accountId || a.id === existing?.transferAccountId);

  const lastAccount = getMeta(db, "last_account");
  const defaultAccount =
    params.accountId ?? (activeAccounts.some((a) => a.id === lastAccount) ? lastAccount : activeAccounts[0]?.id) ?? null;

  const [type, setType] = useState<TransactionType>(existing?.type ?? params.type ?? "expense");
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? defaultAccount);
  const [toId, setToId] = useState<string | null>(existing?.transferAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [amount, setAmount] = useState(existing ? minorToInput(existing.amount, existing.currency) : "");
  const [received, setReceived] = useState(
    existing?.transferAmount != null && existing.transferCurrency && existing.transferCurrency !== existing.currency
      ? minorToInput(existing.transferAmount, existing.transferCurrency)
      : "",
  );
  const [rate, setRate] = useState("");
  const [fxMode, setFxMode] = useState<"received" | "rate">("received");
  const [fee, setFee] = useState(existing && existing.fee > 0 ? minorToInput(existing.fee, existing.currency) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [date, setDate] = useState(existing?.occurredAt ?? toLocalISODate());
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categories = useData((d) => (type === "transfer" ? [] : listCategories(d, { kind: type })), [type]);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const budgets = useData((d) => (validDate ? budgetsForMonth(d, new Date(`${date}T00:00:00`)) : []), [date.slice(0, 7), validDate]);
  const source = accounts.find((a) => a.id === accountId);
  const dest = accounts.find((a) => a.id === toId);
  const currency = source?.currency ?? base;
  const crossCurrency = type === "transfer" && !!dest && !!source && dest.currency !== source.currency;
  const parsedAmount = parseAmountInput(amount, currency);
  const major = parsedAmount.error === null ? fromMinor(parsedAmount.minor, currency) : 0;
  const hasErrors = Object.values(errors).some(Boolean);

  if (accounts.length === 0) {
    return (
      <Screen sheet={t.transaction.new}>
        <ErrorCard title={t.common.noAccountsYet} style={{ marginBottom: 20 }}>
          {t.common.addAccountFirst}
        </ErrorCard>
        <Button label={t.common.addAccount} icon="plus" onPress={() => router.replace("/account-form")} />
      </Screen>
    );
  }

  // Cross-currency: whichever side the user didn't type is derived.
  const market =
    crossCurrency && source && dest && source.currency in rates && dest.currency in rates
      ? toBaseCurrency(1, source.currency, dest.currency, rates)
      : null;
  const parsedReceived = dest ? parseAmountInput(received, dest.currency) : null;
  const impliedRate =
    fxMode === "received" && parsedReceived?.error === null && major > 0 && dest ? fromMinor(parsedReceived.minor, dest.currency) / major : null;
  const derivedReceived =
    fxMode === "rate" && dest && Number(rate) > 0 && major > 0
      ? roundToCurrency(major * Number(rate), dest.currency).toFixed(currencyDecimals(dest.currency))
      : null;

  // "Live sync preview": the budget and balance this expense moves.
  const budget = type === "expense" && categoryId ? budgets.find((b) => b.categoryId === categoryId) : undefined;
  const category = categories.find((x) => x.id === categoryId);
  let projected = 0;
  if (budget) {
    projected = budget.spent + toBaseCurrency(major, currency, budget.currency, rates);
    // When editing, this transaction is already in the month's spend.
    if (existing && existing.type === "expense" && existing.categoryId === categoryId && existing.occurredAt.slice(0, 7) === date.slice(0, 7)) {
      projected -= toBaseCurrency(fromMinor(existing.amount, existing.currency), existing.currency, budget.currency, rates);
    }
  }
  const budgetLimit = budget ? budget.spent + budget.remaining : 0;
  const projectedPct = budgetLimit > 0 ? (projected / budgetLimit) * 100 : 0;
  const balanceNow = source ? source.balance + (existing?.type === "expense" && existing.accountId === source.id ? existing.amount : 0) : 0;
  const limitText = budget ? fmtShort(budgetLimit, budget.currency).replace(`${budget.currency} `, "") : "";

  function save() {
    const next: Record<string, string | null> = {};
    if (!accountId || !source) next.account = t.common.chooseAccountDot;
    const a = parseAmountInput(amount, currency);
    if (a.error !== null) next.amount = translateError(a.error, t);
    let transferAmount: number | null = null;
    let exchangeRate: number | null = null;
    let feeMinor = 0;
    if (type === "transfer") {
      if (!toId) next.to = t.common.chooseAccountDot;
      if (crossCurrency && dest) {
        if (fxMode === "received") {
          const r = parseAmountInput(received, dest.currency);
          if (r.error !== null) next.received = translateError(r.error, t);
          else transferAmount = r.minor;
        } else {
          const n = Number(rate);
          if (!rate.trim() || !Number.isFinite(n) || n <= 0) next.rate = t.transaction.enterRate;
          else exchangeRate = n;
        }
      }
      if (fee.trim()) {
        const f = parseAmountInput(fee, currency, { allowZero: true });
        if (f.error !== null) next.fee = translateError(f.error, t);
        else feeMinor = f.minor;
      }
    }
    setErrors(next);
    if (Object.values(next).some(Boolean) || a.error !== null || !accountId) return;

    const draft: TransactionDraft = {
      type,
      accountId,
      categoryId: type === "transfer" ? null : categoryId,
      transferAccountId: type === "transfer" ? toId : null,
      amount: a.minor,
      transferAmount,
      exchangeRate,
      fee: feeMinor,
      note,
      occurredAt: date,
    };
    try {
      if (existing) updateTransaction(db, existing.id, draft);
      else createTransaction(db, draft);
      setMeta(db, "last_account", accountId);
      router.back();
    } catch (e) {
      showAlert(t.common.couldntSave, translateError(e, t));
    }
  }

  function remove() {
    if (!existing) return;
    deleteTransaction(db, existing.id);
    setConfirmDelete(false);
    router.back();
  }

  const clear = (key: string) => errors[key] && setErrors({ ...errors, [key]: null });
  const saveLabel = existing ? t.common.saveChanges : type === "transfer" ? t.transaction.saveTransfer : t.transaction.save;

  return (
    <Screen sheet={existing ? t.transaction.edit : t.transaction.new}>
      <Segmented
        options={[
          { value: "expense", label: t.common.expense },
          { value: "income", label: t.common.income },
          { value: "transfer", label: t.common.transfer },
        ]}
        value={type}
        onChange={(next: TransactionType) => {
          setType(next);
          setCategoryId(null);
          setErrors({});
        }}
        style={{ marginBottom: type === "transfer" ? 16 : 8 }}
      />

      {type !== "transfer" ? (
        <View style={{ paddingTop: 12, paddingBottom: 8, marginBottom: 12, alignItems: "center" }}>
          <AmountField
            label={t.common.amount}
            value={amount}
            onChange={(text) => {
              setAmount(text);
              clear("amount");
            }}
            currency={currency}
            error={errors.amount}
            large
            sign={type === "income" ? "+" : existing ? "−" : ""}
            color={type === "income" ? c.positiveText : undefined}
            autoFocus={!existing}
          />
          {currency !== base && major > 0 ? (
            <Badge
              label={t.transaction.atTodaysRate(`≈ ${fmtMajor(toBaseCurrency(major, currency, base, rates), base)} ${base}`)}
              style={{ marginTop: 6, alignSelf: "center" }}
            />
          ) : null}
        </View>
      ) : null}

      <AccountPicker
        label={type === "income" ? t.common.toAccount : t.common.fromAccount}
        accounts={activeAccounts}
        value={accountId}
        onChange={(id) => {
          setAccountId(id);
          if (id === toId) setToId(null);
          clear("account");
        }}
        error={errors.account}
      />

      {type === "transfer" ? (
        <>
          <View style={{ alignItems: "center", marginTop: -10, marginBottom: 6 }}>
            <IconButton
              icon="swap"
              size="sm"
              label={t.transaction.swapAccounts}
              disabled={!toId}
              onPress={() => {
                setAccountId(toId);
                setToId(accountId);
                setReceived("");
                setRate("");
              }}
            />
          </View>
          <AccountPicker
            label={t.common.toAccount}
            accounts={activeAccounts}
            value={toId}
            onChange={(id) => {
              setToId(id);
              clear("to");
            }}
            exclude={accountId}
            error={errors.to}
            placeholder={t.transaction.whereMoneyWent}
          />
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <AmountField
              label={crossCurrency ? t.transaction.amountSent : t.common.amount}
              value={amount}
              onChange={(text) => {
                setAmount(text);
                clear("amount");
              }}
              currency={currency}
              error={errors.amount}
              style={{ flex: 1 }}
            />
            {crossCurrency && dest ? (
              <AmountField
                label={t.transaction.amountReceived}
                value={fxMode === "rate" ? (derivedReceived ?? "") : received}
                onChange={(text) => {
                  setReceived(text);
                  setFxMode("received");
                  clear("received");
                }}
                currency={dest.currency}
                error={errors.received}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
          {crossCurrency && source && dest ? (
            <View style={ui.field}>
              <FieldLabel>{t.transaction.exchangeRate}</FieldLabel>
              {fxMode === "rate" ? (
                <InputBox
                  focused
                  error={!!errors.rate}
                  lead={<Text style={[text.input, { flex: 0, color: c.text }]}>1 {source.currency} =</Text>}
                  trail={<Text style={[text.input, { flex: 0, color: c.text }]}>{dest.currency}</Text>}
                >
                  <TextInput
                    value={rate}
                    onChangeText={(text) => {
                      setRate(text.replace(/[^0-9.]/g, ""));
                      clear("rate");
                    }}
                    keyboardType="decimal-pad"
                    keyboardAppearance={c.scheme}
                    placeholder="0.00"
                    placeholderTextColor={c.placeholder}
                    autoFocus
                    accessibilityLabel={t.transaction.exchangeRate}
                    style={[text.input, ui.num, { color: c.text }]}
                  />
                </InputBox>
              ) : (
                <InputBox
                  trail={
                    <Link
                      small
                      label={t.common.edit}
                      onPress={() => {
                        setRate(impliedRate ? fmtRate(impliedRate) : market ? fmtRate(market) : "");
                        setFxMode("rate");
                      }}
                    />
                  }
                >
                  <Text style={[text.input, ui.num, { color: impliedRate ? c.text : c.placeholder }]} numberOfLines={1}>
                    1 {source.currency} = {impliedRate ? fmtRate(impliedRate) : "?"} {dest.currency}
                  </Text>
                </InputBox>
              )}
              <FieldMessage
                error={errors.rate}
                hint={`${t.transaction.enterRate}${market ? t.transaction.marketRate(fmtRate(market)) : ""}`}
              />
            </View>
          ) : null}
          <AmountField
            label={t.transaction.fee}
            value={fee}
            onChange={(text) => {
              setFee(text);
              clear("fee");
            }}
            currency={currency}
            error={errors.fee}
            hint={t.transaction.feeHint}
          />
        </>
      ) : (
        <CategoryRail label={t.common.category} categories={categories} value={categoryId} onChange={setCategoryId} />
      )}

      {/* Side by side in the wide dialog (W09). */}
      <View style={wide ? { flexDirection: "row", gap: 16 } : null}>
        <View style={wide ? { flex: 1 } : null}>
          <Field label={t.common.note} value={note} onChangeText={setNote} placeholder={t.common.notePlaceholder} />
        </View>
        <View style={wide ? { flex: 1 } : null}>
          <DateField value={date} onChange={setDate} />
        </View>
      </View>

      {type === "expense" && source && major > 0 ? (
        <Card inset style={{ marginBottom: 24 }}>
          <T variant="caption" color={c.mute} style={{ marginBottom: 10 }}>
            {t.transaction.preview}
          </T>
          {budget ? (
            <>
              <Between style={{ marginBottom: 8 }}>
                <T variant="bodySm" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {category?.name ?? t.common.category}
                </T>
                <T variant="bodySm" num>
                  {fmtShort(budget.spent, budget.currency)} → {fmtShort(projected, budget.currency).replace(`${budget.currency} `, "")} / {limitText}
                </T>
              </Between>
              <ProgressBar pct={projectedPct} color={projectedPct >= 100 ? c.negative : resolveColor(category?.color ?? "primary")} />
            </>
          ) : null}
          <Between style={{ marginTop: budget ? 12 : 0 }}>
            <T variant="bodySm" numberOfLines={1} style={{ flexShrink: 1 }}>
              {source.name}
            </T>
            <T variant="bodySm" num>
              {fmtMinor(balanceNow, currency)} → {fmtMinor(balanceNow - (parsedAmount.minor ?? 0), currency).replace(`${currency} `, "")}
            </T>
          </Between>
          <T variant="caption" color={c.mute} style={{ marginTop: 10 }}>
            {t.transaction.updateNow}
          </T>
        </Card>
      ) : null}

      {hasErrors ? (
        <ErrorCard title={t.transaction.couldntSave} style={{ marginBottom: 20 }}>
          {t.transaction.fixFields}
        </ErrorCard>
      ) : null}

      <Actions>
        <Button label={saveLabel} onPress={save} />
        {/* The dialog's footer: Cancel, unless a destructive action takes the room. */}
        {wide && !existing ? <Button label={t.common.cancel} variant="outline" onPress={() => router.back()} /> : null}
        {existing ? <Button label={t.transaction.delete} variant="danger" icon="trash" onPress={() => setConfirmDelete(true)} /> : null}
      </Actions>

      <ConfirmDialog
        visible={confirmDelete}
        title={t.transaction.deleteTitle}
        body={t.transaction.updateNow}
        confirmLabel={t.transaction.delete}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}
