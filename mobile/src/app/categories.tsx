import { router } from "expo-router";
import { Avatar, Button, Group, GroupLabel, IconButton, NavHeader, Row, Screen } from "../components/ui";
import { listCategories, setCategoryArchived } from "../data/categories";
import type { Category } from "../db/schema";
import { db } from "../db/client";
import { useData } from "../lib/hooks";
import { useT } from "../lib/i18n";

/** M21 Categories: spending and income; archiving hides a category from
 * pickers without touching its history. */
export default function Categories() {
  const t = useT();
  const all = useData((d) => listCategories(d, { includeArchived: true }));
  const spending = all.filter((x) => !x.archived && x.kind === "expense");
  const income = all.filter((x) => !x.archived && x.kind === "income");
  const archived = all.filter((x) => x.archived);
  const open = (cat: Category) => router.push({ pathname: "/category-form", params: { id: cat.id } });
  const add = () => router.push({ pathname: "/category-form", params: { kind: "expense" } });

  return (
    <Screen narrow>
      <NavHeader
        parent={{ label: t.settings.title, href: "/settings" }}
        title={t.categories.title}
        right={<IconButton icon="plus" size="sm" variant="brand" label={t.categories.add} onPress={add} />}
      />
      <GroupLabel first>{t.categories.spending}</GroupLabel>
      <Group>
        {spending.map((cat) => (
          <Row
            key={cat.id}
            left={<Avatar color={cat.color} icon={cat.icon} size="sm" />}
            title={cat.name}
            value={cat.spendingType ? t.spendingTypes[cat.spendingType] : undefined}
            valueSmall
            onPress={() => open(cat)}
          />
        ))}
      </Group>
      <GroupLabel>{t.common.income}</GroupLabel>
      <Group>
        {income.map((cat) => (
          <Row key={cat.id} left={<Avatar color={cat.color} icon={cat.icon} size="sm" />} title={cat.name} onPress={() => open(cat)} />
        ))}
      </Group>
      {archived.length > 0 ? (
        <>
          <GroupLabel>{t.common.archived}</GroupLabel>
          <Group>
            {archived.map((cat) => (
              <Row
                key={cat.id}
                dim
                left={<Avatar color={cat.color} icon={cat.icon} size="sm" />}
                title={cat.name}
                right={<Button label={t.common.restore} variant="soft" small onPress={() => setCategoryArchived(db, cat.id, false)} />}
              />
            ))}
          </Group>
        </>
      ) : null}
      <Button label={t.categories.add} variant="outline" icon="plus" onPress={add} style={{ marginTop: 24 }} />
    </Screen>
  );
}
