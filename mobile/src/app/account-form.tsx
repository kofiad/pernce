import { ACCOUNT_TYPES, initials, minorToInput, parseAmountInput } from "@pernce/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AmountField, CurrencyPicker } from "../components/inputs";
import { ACCOUNT_COLOURS as COLOURS, ACCOUNT_ICONS, ColorRow, IconRow } from "../components/look";
import { Icon } from "../components/Icon";
import { Actions, Button, Chip, FieldLabel, Field, HScroll, InsetNote, Screen, SelectField, T } from "../components/ui";
import { accountHasTransactions, createAccount, getAccount, updateAccount, type AccountType } from "../data/accounts";
import { listRates, rateWarning } from "../data/rates";
import { db } from "../db/client";
import { translateError } from "../i18n";
import { useData, useProfile } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { showAlert } from "../lib/alert";

/** M12 / M13 Add and edit account (sheet). Currency is fixed once the
 * account has transactions; the opening balance seeds the computed
 * balance. */
export default function AccountForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const t = useT();
  const existing = useData((d) => (id ? getAccount(d, id) : null), [id]);
  const locked = useData((d) => (id ? accountHasTransactions(d, id) : false), [id]);
  const base = useProfile()?.baseCurrency ?? "USD";
  const rates = useData(listRates);

  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "bank");
  const [institution, setInstitution] = useState(existing?.institution ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? base);
  const warning = rateWarning(currency, rates.find((r) => r.currency === currency));
  const [color, setColor] = useState<string>(existing?.color ?? COLOURS[0]);
  const [icon, setIcon] = useState<string | null>(existing?.icon ?? null);
  const [opening, setOpening] = useState(existing ? minorToInput(existing.openingBalance, existing.currency) : "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = parseAmountInput(opening.trim() === "" ? "0" : opening, currency, { allowZero: true, allowNegative: true });
    if (parsed.error !== null) return setError(translateError(parsed.error, t));
    try {
      const input = { name, type, institution, currency, color, icon, openingBalance: parsed.minor };
      if (id) updateAccount(db, id, input);
      else createAccount(db, input);
      router.back();
    } catch (e) {
      showAlert(t.common.couldntSave, translateError(e, t));
    }
  }

  return (
    <Screen sheet={id ? t.accountForm.edit : t.accountForm.add}>
      <Field label={t.accountForm.name} value={name} onChangeText={setName} placeholder={t.accountForm.namePlaceholder} autoFocus={!id} />
      <FieldLabel>{t.accountForm.type}</FieldLabel>
      <HScroll style={{ marginBottom: 20 }}>
        {ACCOUNT_TYPES.map((at) => (
          <Chip key={at.value} label={t.accountTypes[at.value]} active={type === at.value} onPress={() => setType(at.value)} />
        ))}
      </HScroll>
      <Field label={t.accountForm.institution} value={institution} onChangeText={setInstitution} placeholder={t.accountForm.institutionPlaceholder} />
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {locked ? (
          <SelectField
            label={t.common.currency}
            value={currency}
            trail={<Icon name="lock" color={c.text} variant="s" />}
            hint={t.accountForm.currencyLocked}
            style={{ flex: 1 }}
          />
        ) : (
          <CurrencyPicker
            value={currency}
            onChange={(next) => {
              setCurrency(next);
              setOpening("");
            }}
            style={{ flex: 1 }}
          />
        )}
        <AmountField
          label={t.accountForm.openingBalance}
          value={opening}
          onChange={(text) => {
            setOpening(text);
            setError(null);
          }}
          currency={currency}
          allowNegative
          error={error}
          style={{ flex: 1 }}
        />
      </View>
      {warning && (
        <View style={{ marginBottom: 16 }}>
          <InsetNote icon="alert">{t.accountForm.rateWarning[warning]}</InsetNote>
          <Button
            small
            variant="outline"
            label={t.accountForm.setManualRate}
            onPress={() => router.push("/rates")}
            style={{ marginTop: 8, alignSelf: "flex-start" }}
          />
        </View>
      )}
      <ColorRow value={color} onChange={setColor} presets={COLOURS} icon={icon} letters={initials(name.trim() || "?")} />
      <IconRow
        value={icon}
        onChange={setIcon}
        suggestions={ACCOUNT_ICONS}
        initials={initials(name.trim() || "?")}
        style={id ? undefined : { marginBottom: 20 }}
      />
      {id ? null : (
        <T variant="caption" color={c.mute} style={{ marginBottom: 24 }}>
          {t.accountForm.balancesNote}
        </T>
      )}
      <Actions>
        <Button label={id ? t.common.saveChanges : t.accountForm.add} onPress={save} disabled={!name.trim()} />
        <Button label={t.common.cancel} variant="outline" onPress={() => router.back()} />
      </Actions>
    </Screen>
  );
}
