import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  Badge,
  Between,
  Button,
  Card,
  Field,
  Group,
  GroupLabel,
  IconButton,
  Inline,
  InsetNote,
  NavHeader,
  Row,
  Screen,
  T,
} from "../components/ui";
import { listAccounts } from "../data/accounts";
import { clearRateOverride, lastRatesFetch, listRates, refreshMarketRates, setRateOverride, type RateInfo } from "../data/rates";
import { db } from "../db/client";
import { currencyName, translateError, updatedAt } from "../i18n";
import { useData, useProfile } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { showAlert } from "../lib/alert";

/** 4 significant digits, as the artboard writes rates: 0.0685, 0.00178, 1.091. */
const fmtRate = (n: number) => (n >= 1 ? n.toFixed(4) : String(Number(n.toPrecision(3))));

/** The "Manual override" card for one currency. */
function OverrideCard({ r, onDone }: { r: RateInfo; onDone: () => void }) {
  const t = useT();
  const [value, setValue] = useState(r.effective ? fmtRate(r.effective) : "");

  function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return showAlert(t.rates.enterPositive);
    try {
      setRateOverride(db, r.currency, n);
      onDone();
    } catch (e) {
      showAlert(t.common.couldntSave, translateError(e, t));
    }
  }

  return (
    <Card style={{ marginBottom: 12 }}>
      <Between style={{ marginBottom: 14 }}>
        <Inline gap={10} style={{ flexShrink: 1 }}>
          <Badge label={r.currency} bold />
          <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {currencyName(r.currency, t)}
          </T>
        </Inline>
        {r.override ? <Badge label={t.common.manual} brand /> : <Badge label={t.common.auto} />}
      </Between>
      <Field
        label={t.rates.inUsd(r.currency)}
        value={value}
        onChangeText={(text) => setValue(text.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        hint={r.market ? t.rates.marketToday(fmtRate(r.market.rateToUsd)) : t.rates.noMarket}
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          label={t.rates.useAutomatic}
          variant="soft"
          small
          style={{ flex: 1 }}
          onPress={() => {
            if (r.override) clearRateOverride(db, r.currency);
            onDone();
          }}
        />
        <Button label={t.rates.useThisRate} small style={{ flex: 1 }} onPress={save} />
      </View>
    </Card>
  );
}

/** M24 Exchange rates: 1 unit -> USD, refreshed daily. A manual rate wins
 * until "Use automatic". */
export default function Rates() {
  const { c } = useTheme();
  const t = useT();
  const rates = useData(listRates);
  const last = useData(lastRatesFetch);
  const used = useData((d) => listAccounts(d, { includeArchived: true }).map((a) => a.currency));
  const base = useProfile()?.baseCurrency ?? "USD";
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const mine = rates.filter((r) => used.includes(r.currency) || r.currency === base || r.override);
  const overrides = rates.filter((r) => r.override || r.currency === editing);

  async function refresh() {
    setBusy(true);
    try {
      await refreshMarketRates(db);
    } catch (e) {
      showAlert(t.rates.couldntRefresh, translateError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen narrow>
      <NavHeader
        parent={{ label: t.settings.title, href: "/settings" }}
        title={t.rates.title}
        right={
          busy ? (
            <View style={{ width: 36, alignItems: "center" }}>
              <ActivityIndicator color={c.text} />
            </View>
          ) : (
            <IconButton icon="refresh" size="sm" variant="ghost" label={t.rates.refresh} onPress={refresh} />
          )
        }
      />
      <InsetNote icon="info" style={{ marginTop: 8, marginBottom: 8 }}>
        {last ? updatedAt(last, t) : t.rates.notUpdated} · {t.rates.baseCurrency(base)}
      </InsetNote>

      <GroupLabel>{t.rates.yours}</GroupLabel>
      {mine.length === 0 ? (
        <T variant="bodySm" color={c.mute}>
          {t.rates.allUsd}
        </T>
      ) : (
        <Group>
          {mine.map((r) => (
            <Row
              key={r.currency}
              left={<Badge label={r.currency} bold style={{ width: 52, justifyContent: "center" }} />}
              title={currencyName(r.currency, t)}
              sub={r.effective ? `1 ${r.currency} = $${fmtRate(r.effective)}` : t.rates.noRate}
              value={r.override ? t.common.manual : t.common.auto}
              valueSmall
              onPress={() => setEditing(r.currency)}
            />
          ))}
        </Group>
      )}

      {overrides.length > 0 ? (
        <>
          <GroupLabel>{t.rates.manualOverride}</GroupLabel>
          {overrides.map((r) => (
            <OverrideCard key={`${r.currency}-${r.override?.id ?? "auto"}`} r={r} onDone={() => setEditing(null)} />
          ))}
        </>
      ) : null}

      <Button label={t.rates.refresh} variant="outline" icon="refresh" loading={busy} onPress={refresh} style={{ marginTop: 24 }} />
    </Screen>
  );
}
