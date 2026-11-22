import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { FONT, useTheme } from "../../lib/theme";
import { Icon } from "../Icon";
import { T } from "./display";
import { hoverTint, styles, text } from "./styles";

/** Form building blocks: labels, inputs, fields, selects, segmented controls and toggles. */

export function FieldLabel({ children }: { children: string }) {
  return (
    <T variant="fieldLabel" style={{ marginBottom: 8 }}>
      {children}
    </T>
  );
}

/** .help / .help.err, 8px under a field. */
export function FieldMessage({ error, hint }: { error?: string | null; hint?: ReactNode }) {
  const { c } = useTheme();
  if (error)
    return (
      <T variant="caption" color={c.negativeText} style={{ marginTop: 8 }}>
        {error}
      </T>
    );
  if (hint)
    return (
      <T variant="caption" color={c.stone} style={{ marginTop: 8 }}>
        {hint}
      </T>
    );
  return null;
}

/** The .in box: 56px, 12px radius, hairline; a 2px text-colored ring when
 * focused, a danger hairline on error. Lead / trail icons sit inside. */
export function InputBox({
  children,
  lead,
  trail,
  focused,
  error,
  height = 56,
  style,
}: {
  children: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  focused?: boolean;
  error?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.input,
        { height, backgroundColor: c.field, borderColor: c.fieldBorder },
        focused ? { borderColor: c.text, boxShadow: `0 0 0 1px ${c.text}` } : null,
        error ? { borderColor: c.negative } : null,
        style,
      ]}
    >
      {lead}
      {children}
      {trail}
    </View>
  );
}

/** .field: label, input, help. 20px below, like the artboard. */
export function Field({
  label,
  error,
  hint,
  lead,
  trail,
  mono,
  containerStyle,
  inputStyle,
  ...input
}: TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: ReactNode;
  /** An icon name or a node. */
  lead?: ReactNode;
  trail?: ReactNode;
  mono?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const hasValue = !!input.value;
  const iconColor = hasValue ? c.text : c.placeholder;
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <InputBox
        focused={focused}
        error={!!error}
        lead={typeof lead === "string" ? <Icon name={lead} color={iconColor} variant="s" /> : lead}
        trail={typeof trail === "string" ? <Icon name={trail} color={iconColor} variant="s" /> : trail}
      >
        <TextInput
          placeholderTextColor={c.placeholder}
          keyboardAppearance={c.scheme}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[text.input, { color: c.text }, mono ? { fontFamily: FONT.mono } : null, inputStyle]}
        />
      </InputBox>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

/** A .field that opens a choice: value (or placeholder) with a ⌄. */
export function SelectField({
  label,
  value,
  placeholder,
  lead,
  trail,
  onPress,
  error,
  hint,
  style,
}: {
  label?: string;
  value?: string | null;
  placeholder?: string;
  lead?: ReactNode;
  trail?: ReactNode;
  onPress?: () => void;
  error?: string | null;
  hint?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const color = value ? c.text : c.placeholder;
  return (
    <View style={[styles.field, style]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={!onPress}>
        <InputBox
          error={!!error}
          lead={typeof lead === "string" ? <Icon name={lead} color={color} variant="s" /> : lead}
          trail={trail ?? <Icon name="chevron-down" color={color} variant="s" />}
        >
          <Text style={[text.input, { color }]} numberOfLines={1}>
            {value || placeholder}
          </Text>
        </InputBox>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

/** .seg: pill track with the selected segment in chip-on. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange?: (v: V) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: c.chip }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange?.(o.value)}
            disabled={!onChange}
            style={(state) => [styles.segItem, active ? { backgroundColor: c.chipActive } : hoverTint(c, state)]}
          >
            <Text style={[text.seg, { color: active ? c.chipActiveText : c.mute }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** .tg: 51×31 switch; on is a text-colored track with a canvas knob. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={6}
      style={[styles.toggle, { backgroundColor: value ? c.text : c.track }]}
    >
      <View style={[styles.knob, { left: value ? 23 : 3, backgroundColor: value ? c.canvas : c.stone }]} />
    </Pressable>
  );
}
