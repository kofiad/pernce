import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Icon } from "../components/Icon";
import { Button, Card, Group, GroupLabel, Inline, NavHeader, Note, Row, Screen, T } from "../components/ui";
import {
  exportBackup,
  exportTransactionsCsv,
  importBackup,
  importTransactionsCsv,
  type ImportReport,
} from "../data/backup";
import { countTransactions } from "../data/transactions";
import { db } from "../db/client";
import { translateError } from "../i18n";
import { useData } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { pickTextFile, shareTextFile, stampedName } from "../lib/files";
import { useTheme } from "../lib/theme";
import { showAlert } from "../lib/alert";

function Lines({ title, color, lines }: { title: string; color: string; lines: string[] }) {
  const { c } = useTheme();
  const t = useT();
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: 4, marginTop: 12 }}>
      <T variant="label" color={color}>
        {title} ({lines.length})
      </T>
      {lines.slice(0, 50).map((m, i) => (
        <T key={i} variant="caption" color={c.mute}>
          • {m}
        </T>
      ))}
      {lines.length > 50 ? (
        <T variant="caption" color={c.mute}>
          {t.data.andMore(lines.length - 50)}
        </T>
      ) : null}
    </View>
  );
}

function Report({ report }: { report: ImportReport }) {
  const { c } = useTheme();
  const t = useT();
  const { counts } = report;
  const parts = [
    counts.accounts && t.data.accountsCount(counts.accounts),
    counts.categories && t.data.categoriesCount(counts.categories),
    t.data.transactionsCount(counts.transactions),
    counts.budgets && t.data.budgetsCount(counts.budgets),
    counts.rates && t.data.ratesCount(counts.rates),
  ].filter(Boolean);
  return (
    <Card inset style={{ marginTop: 16 }}>
      <Inline gap={8}>
        <Icon name="check" color={c.text} variant="s" />
        <T variant="label">{t.data.imported(t.data.kinds[report.kind])}</T>
      </Inline>
      <T variant="caption" color={c.mute} style={{ marginTop: 6 }}>
        {parts.join(" · ")}
      </T>
      <Lines title={t.data.changedToFit} color={c.warning} lines={report.adjusted} />
      <Lines title={t.data.notImported} color={c.negativeText} lines={report.skipped} />
    </Card>
  );
}

/** M25 Your data: export and import both ways. JSON is a full,
 * round-trippable backup; CSV is transactions only. */
export default function DataScreen() {
  const { c } = useTheme();
  const t = useT();
  const rows = useData(countTransactions);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      showAlert(t.common.somethingWentWrong, translateError(e, t));
    } finally {
      setBusy(null);
    }
  }

  const exportJson = () =>
    run("json", () =>
      shareTextFile(stampedName("pernce-backup", "json"), JSON.stringify(exportBackup(db), null, 2), "application/json", "public.json"),
    );
  const exportCsv = () =>
    run("csv", () =>
      shareTextFile(stampedName("pernce-transactions", "csv"), exportTransactionsCsv(db), "text/csv", "public.comma-separated-values-text"),
    );

  const importJson = () =>
    run("import-json", async () => {
      const file = await pickTextFile(["application/json", "text/plain", "*/*"]);
      if (!file) return;
      let json: unknown;
      try {
        json = JSON.parse(file.text);
      } catch {
        throw new Error(t.data.invalidJson(file.name));
      }
      setReport(importBackup(db, json));
    });

  const importCsv = () =>
    run("import-csv", async () => {
      const file = await pickTextFile(["text/csv", "text/comma-separated-values", "text/plain", "*/*"]);
      if (!file) return;
      setReport(importTransactionsCsv(db, file.text));
    });

  const spinner = (key: string) => (busy === key ? <ActivityIndicator color={c.stone} /> : undefined);

  return (
    <Screen narrow>
      <NavHeader parent={{ label: t.settings.title, href: "/settings" }} title={t.data.title} />
      <GroupLabel first>{t.data.export}</GroupLabel>
      <Card style={{ marginBottom: 12 }}>
        <Inline style={{ marginBottom: 12, alignItems: "flex-start" }}>
          <Icon name="file" color={c.text} />
          <View style={{ flex: 1 }}>
            <T variant="bodyBold">{t.data.fullBackup}</T>
            <T variant="caption" color={c.mute}>
              {t.data.fullBackupBody}
            </T>
          </View>
        </Inline>
        <Button label={t.data.exportBackup} icon="upload" onPress={exportJson} loading={busy === "json"} />
      </Card>
      <Card>
        <Inline style={{ marginBottom: 12, alignItems: "flex-start" }}>
          <Icon name="list" color={c.text} />
          <View style={{ flex: 1 }}>
            <T variant="bodyBold">{t.data.csvTitle}</T>
            <T variant="caption" color={c.mute}>
              {t.data.csvBody(rows.toLocaleString("en-US"), rows)}
            </T>
          </View>
        </Inline>
        <Button label={t.data.exportCsv} variant="outline" icon="upload" onPress={exportCsv} loading={busy === "csv"} />
      </Card>

      <GroupLabel>{t.data.import}</GroupLabel>
      <Group>
        <Row icon="download" title={t.data.importJson} right={spinner("import-json")} onPress={importJson} />
        <Row icon="download" title={t.data.importCsv} right={spinner("import-csv")} onPress={importCsv} />
      </Group>
      {report ? <Report report={report} /> : null}
      <Note icon="shield" style={{ marginTop: 16 }}>
        {t.data.privacy}
      </Note>
    </Screen>
  );
}
