import { type SpendingType } from "@pernce/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CATEGORY_COLOURS as COLOURS, CATEGORY_ICON_SUGGESTIONS, ColorRow, IconRow } from "../components/look";
import { Actions, Button, Chip, Field, FieldLabel, Screen, Segmented } from "../components/ui";
import { createCategory, getCategory, setCategoryArchived, updateCategory, type CategoryKind } from "../data/categories";
import { db } from "../db/client";
import { translateError } from "../i18n";
import { useData } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useLayout } from "../lib/layout";
import { showAlert } from "../lib/alert";

/** M22 Category form (sheet): name, kind, essential vs discretionary,
 * colour and icon. */
export default function CategoryForm() {
  const params = useLocalSearchParams<{ id?: string; kind?: CategoryKind }>();
  const { wide } = useLayout();
  const t = useT();
  const existing = useData((d) => (params.id ? getCategory(d, params.id) : null), [params.id]);
  const [kind, setKind] = useState<CategoryKind>(existing?.kind ?? params.kind ?? "expense");
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState<string>(existing?.color ?? COLOURS[3]);
  const [icon, setIcon] = useState(existing?.icon ?? "bag");
  const [spendingType, setSpendingType] = useState<SpendingType>(existing?.spendingType ?? "essential");

  function save() {
    const input = { name, color, icon, spendingType: kind === "expense" ? spendingType : null };
    try {
      if (existing) updateCategory(db, existing.id, input);
      else createCategory(db, { ...input, kind });
      router.back();
    } catch (e) {
      showAlert(t.common.couldntSave, translateError(e, t));
    }
  }

  function archive() {
    if (!existing) return;
    setCategoryArchived(db, existing.id, true);
    router.back();
  }

  return (
    <Screen sheet={existing ? t.categories.edit : kind === "income" ? t.categories.newIncome : t.categories.newSpending}>
      <Field label={t.categories.name} value={name} onChangeText={setName} placeholder={t.categories.namePlaceholder} autoFocus={!existing} />
      <FieldLabel>{t.categories.kind}</FieldLabel>
      <Segmented
        options={[
          { value: "expense", label: t.categories.spending },
          { value: "income", label: t.common.income },
        ]}
        value={kind}
        onChange={existing ? undefined : setKind}
        style={{ marginBottom: 20 }}
      />
      {kind === "expense" ? (
        <>
          <FieldLabel>{t.categories.typeOfSpending}</FieldLabel>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            <Chip label={t.spendingTypes.essential} active={spendingType === "essential"} onPress={() => setSpendingType("essential")} />
            <Chip label={t.spendingTypes.discretionary} active={spendingType === "discretionary"} onPress={() => setSpendingType("discretionary")} />
          </View>
        </>
      ) : null}
      <ColorRow value={color} onChange={setColor} presets={COLOURS} icon={icon} />
      <IconRow value={icon} onChange={(next) => next && setIcon(next)} suggestions={CATEGORY_ICON_SUGGESTIONS} />
      <Actions>
        <Button label={t.categories.save} onPress={save} disabled={!name.trim()} />
        {/* The dialog's footer: Cancel, unless a destructive action takes the room. */}
        {wide && !existing ? <Button label={t.common.cancel} variant="outline" onPress={() => router.back()} /> : null}
        {existing && !existing.archived ? <Button label={t.categories.archive} variant="danger" icon="archive" onPress={archive} /> : null}
      </Actions>
    </Screen>
  );
}
