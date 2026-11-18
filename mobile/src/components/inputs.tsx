import {
  currencyDecimals,
  sanitizeAmountInput,
  toLocalISODate,
} from "@pernce/core";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AccountWithBalance } from "../data/accounts";
import type { Category } from "../db/schema";
import { currencyName, currencyRows, dateLabel } from "../i18n";
import { useT } from "../lib/i18n";
import { useLayout } from "../lib/layout";
import { currencyPrefix, fmtMinor } from "../lib/money";
import { FONT, GUTTER, radius, useTheme } from "../lib/theme";
import { Icon } from "./Icon";
import { KeyboardBox } from "./keyboard";
import {
  Avatar,
  Badge,
  Chip,
  Dialog,
  FieldLabel,
  FieldMessage,
  HScroll,
  IconButton,
  InputBox,
  ListRow,
  SelectField,
  SheetHeader,
  T,
  styles as ui,
  text,
} from "./ui";

/** Amount entry in the currency's own precision: the keyboard and the
 * sanitizer only allow as many decimals as the currency has. Parsing to
 * minor units happens in the form with core parseAmountInput.
 *
 * `large` is the sheet's centered display amount ("GHS 42.50", "+$450.00");
 * otherwise it's a .field with the currency written in front. */
export function AmountField({
  label,
  value,
  onChange,
  currency,
  error,
  hint,
  large,
  sign = "",
  color,
  allowNegative,
  autoFocus,
  style,
}: {
  label?: string;
  value: string;
  onChange: (text: string) => void;
  currency: string;
  error?: string | null;
  hint?: ReactNode;
  large?: boolean;
  /** Written before the currency in the large amount ("+", "−"). */
  sign?: string;
  color?: string;
  allowNegative?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const t = useT();
  const [focused, setFocused] = useState(false);
  const decimals = currencyDecimals(currency);
  const placeholder = decimals === 0 ? "0" : `0.${"0".repeat(decimals)}`;
  const keyboardType = allowNegative ? "numbers-and-punctuation" : decimals === 0 ? "number-pad" : "decimal-pad";
  const sanitize = (input: string) => onChange(sanitizeAmountInput(input, currency, { allowNegative }));
  const prefix = currencyPrefix(currency);

  if (large) {
    const fg = color ?? c.text;
    return (
      <View style={[s.largeAmount, style]}>
        <View style={s.largeRow}>
          <Text style={[text.display, ui.num, { color: fg, flexShrink: 0 }]}>{`${sign}${prefix}`}</Text>
          <TextInput
            value={value}
            onChangeText={sanitize}
            keyboardType={keyboardType}
            keyboardAppearance={c.scheme}
            placeholder={placeholder}
            placeholderTextColor={c.placeholder}
            autoFocus={autoFocus}
            accessibilityLabel={label ?? t.common.amount}
            style={[s.largeInput, { color: fg }, webWidth(value || placeholder)]}
          />
        </View>
        <FieldMessage error={error} hint={hint} />
      </View>
    );
  }
  return (
    <View style={[ui.field, style]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <InputBox focused={focused} error={!!error}>
        <View style={[ui.inline, ui.grow]}>
          <Text style={[text.input, { flex: 0, color: value ? c.text : c.placeholder }]}>{prefix}</Text>
          <TextInput
            value={value}
            onChangeText={sanitize}
            keyboardType={keyboardType}
            keyboardAppearance={c.scheme}
            placeholder={placeholder}
            placeholderTextColor={c.placeholder}
            autoFocus={autoFocus}
            accessibilityLabel={label ?? t.common.amount}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[text.input, ui.num, { color: c.text }]}
          />
        </View>
      </InputBox>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

/** A browser's <input> has a fixed default width, so on the web the large
 * amount is sized to its digits (tabular, so 1ch each) as a phone does. */
const webWidth = (shown: string): TextStyle | null =>
  Platform.OS === "web" ? ({ width: `${shown.length + 0.5}ch` } as unknown as TextStyle) : null;

function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return toLocalISODate(new Date(y, m - 1, d + days));
}

/** The "Date" field (calendar lead, ⌄ trail); it opens day steppers (no
 * native date picker module needed). */
export function DateField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  const { c } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const today = toLocalISODate();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <>
      <SelectField label={t.date.label} value={dateLabel(value, t)} lead="calendar" onPress={() => setOpen(true)} error={error} />
      <ChoiceSheet visible={open} title={t.date.label} onClose={() => setOpen(false)}>
        <View style={s.dateRow}>
          <IconButton icon="chevron-left" size="sm" label={t.date.previousDay} onPress={() => valid && onChange(shiftDate(value, -1))} />
          <InputBox style={{ flex: 1 }}>
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={c.placeholder}
              keyboardType="numbers-and-punctuation"
              keyboardAppearance={c.scheme}
              maxLength={10}
              style={[text.input, ui.num, { color: c.text, textAlign: "center" }]}
            />
          </InputBox>
          <IconButton icon="chevron-right" size="sm" label={t.date.nextDay} onPress={() => valid && onChange(shiftDate(value, 1))} />
        </View>
        <View style={[ui.inline, { gap: 8, marginTop: 16 }]}>
          <Chip label={t.common.today} active={value === today} onPress={() => onChange(today)} />
          <Chip label={t.common.yesterday} active={value === shiftDate(today, -1)} onPress={() => onChange(shiftDate(today, -1))} />
        </View>
        <T variant="caption" color={c.mute} style={{ marginTop: 16 }}>
          {dateLabel(value, t)}
        </T>
      </ChoiceSheet>
    </>
  );
}

/** A sheet of choices (.sheetc): grab, title, close, then the content. */
export function ChoiceSheet({
  visible,
  title,
  onClose,
  onDismiss,
  scroll = true,
  fill,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** iOS only: after the sheet has finished sliding away. */
  onDismiss?: () => void;
  /** false: the content isn't wrapped in a ScrollView, for content that
   * handles drags itself (the colour wheel) or scrolls itself (a list). */
  scroll?: boolean;
  /** Takes the sheet's full height (80%), e.g. for a list that scrolls. */
  fill?: boolean;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  // Wide screens: a 440 dialog, stacked over whatever opened it (W11).
  if (wide) {
    return (
      <Dialog visible={visible} title={title} onClose={onClose} size="choice" scroll={scroll} fill={fill}>
        {children}
      </Dialog>
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      // Android: draw under the system bars, so insets.bottom (the navigation
      // bar) is the only space left below the sheet.
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* Lifted above the keyboard, e.g. for the hex or search field. */}
      <KeyboardBox>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t.common.close} />
        <View
          style={[
            s.sheet,
            fill ? { height: "80%" } : null,
            { backgroundColor: c.sheet, borderColor: c.hairline, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[ui.grab, { backgroundColor: c.stone }]} />
          <SheetHeader title={title} onClose={onClose} />
          {scroll ? (
            <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={[{ paddingHorizontal: GUTTER, paddingTop: 12 }, fill ? { flex: 1 } : null]}>{children}</View>
          )}
        </View>
      </KeyboardBox>
    </Modal>
  );
}

/** A currency's badge: its symbol ("$") or its code. */
export function CurrencyBadge({ currency }: { currency: string }) {
  return <Badge label={currencyPrefix(currency).trim()} style={{ paddingHorizontal: 8, paddingVertical: 2, alignSelf: "center" }} />;
}

/** A .field that opens the currency list. `long` writes the name too
 * ("USD — US dollar") with the symbol badge in front. */
export function CurrencyPicker({
  value,
  onChange,
  label,
  long,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  long?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const title = label ?? t.common.currency;
  return (
    <>
      <SelectField
        label={title}
        value={long ? `${value} — ${currencyName(value, t)}` : value}
        lead={long ? <CurrencyBadge currency={value} /> : undefined}
        onPress={() => setOpen(true)}
        style={style}
      />
      <CurrencySheet visible={open} value={value} title={title} onClose={() => setOpen(false)} onChange={onChange} />
    </>
  );
}

export function CurrencySheet({
  visible,
  value,
  title,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: string;
  title?: string;
  onClose: () => void;
  onChange: (v: string) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const [query, setQuery] = useState("");
  // Every way of closing goes through here, so the next opening starts
  // unfiltered (onDismiss is iOS-only).
  const close = () => {
    setQuery("");
    onClose();
  };
  const rows = useMemo(() => currencyRows(query, t), [query, t]);
  return (
    <ChoiceSheet
      visible={visible}
      title={title ?? t.common.currency}
      onClose={close}
      scroll={false}
      fill
    >
      <InputBox lead={<Icon name="search" color={c.placeholder} variant="s" />} style={{ marginBottom: 16 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.common.searchCurrencies}
          placeholderTextColor={c.placeholder}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardAppearance={c.scheme}
          style={[text.input, { color: c.text }]}
        />
      </InputBox>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.code}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <T variant="bodySm" color={c.mute}>
            {t.common.noCurrencies}
          </T>
        }
        renderItem={({ item, index }) => (
          <ListRow
            left={<Badge label={item.code} bold style={s.codeBadge} />}
            title={item.name}
            right={value === item.code ? <Icon name="check" color={c.text} /> : null}
            onPress={() => {
              onChange(item.code);
              close();
            }}
            last={index === rows.length - 1}
          />
        )}
      />
    </ChoiceSheet>
  );
}

/** accPick: the chosen account in a 64px field (avatar, name, balance,
 * ⌄); tapping it lists the others. Empty, it's a placeholder with a
 * wallet icon. */
export function AccountPicker({
  accounts,
  value,
  onChange,
  label,
  exclude,
  error,
  placeholder,
}: {
  accounts: AccountWithBalance[];
  value: string | null;
  onChange: (id: string) => void;
  label: string;
  exclude?: string | null;
  error?: string | null;
  placeholder?: string;
}) {
  const { c } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const options = accounts.filter((a) => a.id !== exclude);
  const selected = options.find((a) => a.id === value);
  return (
    <View style={ui.field}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)}>
        {selected ? (
          <InputBox height={64} trail={<Icon name="chevron-down" color={c.text} variant="s" />} error={!!error}>
            <Avatar color={selected.color} label={selected.name} icon={selected.icon ?? undefined} size="sm" />
            <View style={ui.grow}>
              <T variant="label" numberOfLines={1}>
                {selected.name}
              </T>
              <T variant="caption" color={c.stone} num numberOfLines={1}>
                {t.common.balanceOf(fmtMinor(selected.balance, selected.currency))}
              </T>
            </View>
          </InputBox>
        ) : (
          <InputBox
            error={!!error}
            lead={<Icon name="wallet" color={c.placeholder} variant="s" />}
            trail={<Icon name="chevron-down" color={c.placeholder} variant="s" />}
          >
            <Text style={[text.input, { color: c.placeholder }]} numberOfLines={1}>
              {options.length === 0 ? t.common.noOtherAccounts : (placeholder ?? t.common.chooseAccount)}
            </Text>
          </InputBox>
        )}
      </Pressable>
      <FieldMessage error={error} />
      <ChoiceSheet visible={open} title={label} onClose={() => setOpen(false)}>
        {options.map((a, i) => (
          <ListRow
            key={a.id}
            left={<Avatar color={a.color} label={a.name} icon={a.icon ?? undefined} size="sm" />}
            title={a.name}
            sub={t.common.balanceOf(fmtMinor(a.balance, a.currency))}
            right={a.id === value ? <Icon name="check" color={c.text} /> : null}
            onPress={() => {
              onChange(a.id);
              setOpen(false);
            }}
            last={i === options.length - 1}
          />
        ))}
      </ChoiceSheet>
    </View>
  );
}

/** .catc: a 42px category avatar over the first word of its name; the
 * selected one is ringed and its label bold. */
function CategoryChoice({
  category,
  selected,
  onPress,
  wide,
}: {
  category: Category;
  selected: boolean;
  onPress?: () => void;
  wide?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={category.name}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={[s.catChip, wide ? { width: "25%" } : null]}
    >
      <Avatar color={category.color} icon={category.icon} ring={selected} />
      <T
        variant="caption"
        weight={selected ? "600" : "400"}
        color={selected ? c.text : c.mute}
        numberOfLines={1}
        align="center"
        style={{ fontSize: 12, lineHeight: 17 }}
      >
        {category.name.split(" ")[0]}
      </T>
    </Pressable>
  );
}

/** catRail: categories in a horizontal rail, 20px below. */
export function CategoryRail({
  categories,
  value,
  onChange,
  label,
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <HScroll gap={10} style={{ paddingTop: 4 }}>
        {categories.map((cat) => (
          <CategoryChoice
            key={cat.id}
            category={cat}
            selected={value === cat.id}
            onPress={() => onChange(value === cat.id ? null : cat.id)}
          />
        ))}
      </HScroll>
    </View>
  );
}

/** The budget form's four-column category grid. */
export function CategoryGrid({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string | null;
  /** Omitted when the choice is fixed (editing a budget). */
  onChange?: (id: string) => void;
}) {
  return (
    <View style={s.catGrid}>
      {categories.map((cat) => (
        <CategoryChoice
          key={cat.id}
          category={cat}
          selected={value === cat.id}
          onPress={onChange ? () => onChange(cat.id) : undefined}
          wide
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  largeAmount: { alignItems: "center" },
  largeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  largeInput: { fontFamily: FONT["500"], fontSize: 40, letterSpacing: -0.4, padding: 0, minWidth: 40, fontVariant: ["tabular-nums"] },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1, maxHeight: "80%" },
  codeBadge: { width: 52, paddingHorizontal: 4, justifyContent: "center", alignSelf: "center" },
  catChip: { width: 66, alignItems: "center", gap: 6, paddingVertical: 4 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, marginBottom: 24 },
});
