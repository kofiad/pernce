import { initials, resolveColor } from "@pernce/core";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import type { Health } from "../../lib/budgetHealth";
import { FONT, radius, useTheme } from "../../lib/theme";
import { Icon, type IconSize } from "../Icon";
import { hoverTint, isHovered, styles, text, webRow } from "./styles";

/** Display building blocks: type, avatars, buttons, chips, badges, list rows and the logo. */

/** .rs: left-aligned with a 12px gap. */
export function Inline({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.inline, { gap }, style]}>{children}</View>;
}

type TextVariant =
  | "displayLg"
  | "display"
  | "title"
  | "headingMd"
  | "heading"
  | "bodyLg"
  | "body"
  | "bodyBold"
  | "bodySm"
  | "label"
  | "caption"
  | "sub"
  | "rowTitle"
  | "row"
  | "amount"
  | "fieldLabel"
  | "groupLabel";

type Weight = keyof typeof FONT;

/** The type scale (.d-lg … .cap) plus the list classes (.tx-n, .tx-s,
 * .tx-a, .li, .fl-l, .lbl). `num` is the artboard's .num (tabular figures). */
export function T({
  children,
  variant = "body",
  color,
  weight,
  style,
  numberOfLines,
  align,
  num,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  /** Overrides the variant's weight (Inter needs one family per weight). */
  weight?: Weight;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: TextStyle["textAlign"];
  num?: boolean;
}) {
  const { c } = useTheme();
  const base =
    variant === "sub" || variant === "groupLabel" ? c.stone : variant === "fieldLabel" ? c.mute : c.text;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        text[variant],
        { color: color ?? base },
        weight ? { fontFamily: FONT[weight] } : null,
        align ? { textAlign: align } : null,
        num || variant === "amount" ? styles.num : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const AVATAR = {
  xs: { px: 24, font: 10, icon: "s" },
  sm: { px: 36, font: 12, icon: "s" },
  md: { px: 42, font: 13, icon: "md" },
  lg: { px: 56, font: 18, icon: "md" },
} as const;

/** .av (42), .av.sm (36), .av.lg (56), .av.xs (24): a solid circle with
 * white initials or a white stroke icon. `ring` is .catc.on / .sw.on. */
export function Avatar({
  color,
  label,
  letters,
  icon,
  size = "md",
  iconVariant,
  ring,
}: {
  /** A color token ("accent-teal") or a literal color. */
  color: string;
  /** Shown as its initials ("MTN MoMo" -> "MM"). */
  label?: string;
  /** Shown as-is ("A"). */
  letters?: string;
  icon?: string;
  size?: keyof typeof AVATAR;
  iconVariant?: IconSize;
  ring?: boolean;
}) {
  const { c } = useTheme();
  const a = AVATAR[size];
  const bg = color.startsWith("#") || color.startsWith("rgb") ? color : resolveColor(color);
  return (
    <View
      style={[
        styles.avatar,
        { width: a.px, height: a.px, backgroundColor: bg },
        ring ? { boxShadow: `0 0 0 2px ${c.canvas}, 0 0 0 4px ${c.text}` } : null,
      ]}
    >
      {icon ? (
        <Icon name={icon} color="#ffffff" variant={iconVariant ?? a.icon} />
      ) : label || letters ? (
        <Text style={[text.avatar, { fontSize: a.font }]}>{letters ?? initials(label!)}</Text>
      ) : null}
    </View>
  );
}

/** .ib (44) / .ib.sm (36): a soft circle with an icon; `brand` is the
 * primary "+" and `ghost` the transparent back / more buttons. */
export function IconButton({
  icon,
  onPress,
  label,
  size = "md",
  px,
  variant = "soft",
  iconVariant,
  iconColor,
  disabled,
}: {
  icon: string;
  onPress?: () => void;
  label: string;
  size?: "md" | "sm";
  /** A bigger plate (.qa's 52, the 64/72 hero icons). */
  px?: number;
  variant?: "soft" | "brand" | "ghost" | "selected";
  iconVariant?: IconSize;
  iconColor?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const look = {
    soft: { bg: c.soft, fg: c.softText },
    brand: { bg: c.primary, fg: c.onPrimary },
    ghost: { bg: "transparent", fg: c.text },
    selected: { bg: c.chipActive, fg: c.chipActiveText },
  }[variant];
  const dim = px ?? (size === "sm" ? 36 : 44);
  const plate = { width: dim, height: dim, backgroundColor: look.bg };
  const glyph = <Icon name={icon} color={iconColor ?? look.fg} variant={iconVariant ?? (size === "sm" ? "s" : "md")} />;
  if (!onPress) {
    return (
      <View accessibilityLabel={label} style={[styles.iconButton, plate]}>
        {glyph}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={(state) => [styles.iconButton, plate, { opacity: disabled ? 0.4 : state.pressed ? 0.7 : isHovered(state) ? 0.88 : 1 }]}
    >
      {glyph}
    </Pressable>
  );
}

/** .link as a standalone action ("Change", "Edit"). */
export function Link({ label, onPress, small }: { label: string; onPress: () => void; small?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={(state) => [{ borderRadius: radius.sm }, hoverTint(c, state)]}>
      <T variant={small ? "caption" : "bodySm"} weight="600" color={c.link}>
        {label}
      </T>
    </Pressable>
  );
}

/** .chip / .chip.on: 36px pill. `prefix` is drawn in stone ("USD"). */
export function Chip({
  label,
  prefix,
  dot,
  active,
  onPress,
  trailingIcon,
  style,
}: {
  label: string;
  prefix?: string;
  dot?: string;
  active?: boolean;
  onPress?: () => void;
  trailingIcon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const fg = active ? c.chipActiveText : c.chipText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      disabled={!onPress}
      style={(state) => [styles.chip, { backgroundColor: active ? c.chipActive : c.chip }, onPress ? hoverTint(c, state) : null, style]}
    >
      {dot ? <Dot color={dot} /> : null}
      <Text style={[text.chip, { color: fg }]} numberOfLines={1}>
        {prefix ? <Text style={{ color: c.stone }}>{prefix} </Text> : null}
        {label}
      </Text>
      {trailingIcon ? <Icon name={trailingIcon} color={fg} variant="xs" /> : null}
    </Pressable>
  );
}

/** .badge / .badge.brand */
export function Badge({ label, brand, style, bold }: { label: string; brand?: boolean; style?: StyleProp<ViewStyle>; bold?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: brand ? c.primary : c.chip }, style]}>
      <Text style={[text.badge, { color: brand ? c.onPrimary : c.chipText }, bold ? { fontFamily: FONT["600"] } : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** .dot: 8px status / legend dot. */
export function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** status(): a dot and a caption, never colour alone. */
export function Status({ state, label }: { state: Health; label: string }) {
  const { c } = useTheme();
  const color = state === "over" ? c.negative : state === "near" ? c.warning : c.positive;
  return (
    <Inline gap={6} style={styles.flexShrink}>
      <Dot color={color} />
      <T variant="caption" color={c.mute} numberOfLines={1}>
        {label}
      </T>
    </Inline>
  );
}

/** .tx: avatar, 15px title over a 13px stone subline, amount on the right;
 * 64px tall with a divider below unless it's the last row. */
export function ListRow({
  left,
  title,
  titleColor,
  sub,
  subColor,
  right,
  rightColor,
  rightSub,
  onPress,
  last,
  dim,
}: {
  left?: ReactNode;
  title: string;
  titleColor?: string;
  sub?: string | null;
  subColor?: string;
  right?: ReactNode;
  rightColor?: string;
  rightSub?: string | null;
  onPress?: () => void;
  last?: boolean;
  /** Archived rows (opacity .6). */
  dim?: boolean;
}) {
  const { c } = useTheme();
  const content = (
    <View style={[styles.txRow, !last && { borderBottomWidth: 1, borderBottomColor: c.divider }, dim && { opacity: 0.6 }]}>
      {left}
      <View style={styles.grow}>
        <T variant="rowTitle" color={titleColor} numberOfLines={1}>
          {title}
        </T>
        {sub ? (
          <T variant="sub" color={subColor} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      {right !== undefined && right !== null ? (
        <View style={styles.rowRight}>
          {typeof right === "string" ? (
            <T variant="amount" color={rightColor}>
              {right}
            </T>
          ) : (
            right
          )}
          {rightSub ? (
            <T variant="sub" num>
              {rightSub}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={(state) => [{ opacity: state.pressed ? 0.6 : 1 }, webRow, hoverTint(c, state)]}>
      {content}
    </Pressable>
  );
}

/** .prog: 8px track and fill. */
export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.progressTrack, { backgroundColor: c.track }]}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

export type ButtonVariant = "primary" | "outline" | "soft" | "brand" | "danger" | "text";

/** .btn: 48px pill (.btn.sm 36px). Variants: .p (primary), .o (outline),
 * .s (soft), .brand, .danger (red text on a hairline), .txt (text only). */
export function Button({
  label,
  onPress,
  variant = "primary",
  small,
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  small?: boolean;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const look = {
    primary: { bg: c.buttonBg, fg: c.buttonText, border: "transparent" },
    outline: { bg: "transparent", fg: c.text, border: c.outline },
    soft: { bg: c.soft, fg: c.softText, border: "transparent" },
    brand: { bg: c.primary, fg: c.onPrimary, border: "transparent" },
    danger: { bg: "transparent", fg: c.negativeText, border: c.hairline },
    text: { bg: "transparent", fg: c.text, border: "transparent" },
  }[variant];
  const filled = variant === "primary" || variant === "brand";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        small ? styles.buttonSmall : null,
        variant === "text" ? { height: 44 } : null,
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          // Filled buttons fade on hover; the rest take the --hover tint.
          opacity: disabled ? 0.4 : state.pressed ? 0.8 : filled && isHovered(state) ? 0.88 : 1,
        },
        filled || disabled ? null : hoverTint(c, state),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} color={look.fg} variant="s" /> : null}
          <Text style={[small ? text.buttonSmall : text.button, { color: look.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** The brand mark: docs/design/icons/pernce-favicon.svg (the rounded-corner
 * variant), drawn in {colors.primary}. Decorative: whatever sits beside it
 * (the wordmark, a heading) names the app. */
export function BrandMark({ size }: { size: number }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Rect width={1024} height={1024} rx={224} fill={c.primary} />
      <Path fill="#fff" fillOpacity={0.4} fillRule="evenodd" d="M592 352a180 180 0 1 1 0 360a180 180 0 1 1 0-360zM592 456a76 76 0 1 0 0 152a76 76 0 1 0 0-152z" />
      <Circle cx={452} cy={432} r={228} fill={c.primary} />
      <Rect x={224} y={232} width={172} height={588} fill={c.primary} />
      <G fill="#fff">
        <Rect x={252} y={232} width={116} height={560} />
        <Path fillRule="evenodd" d="M452 232a200 200 0 1 1 0 400a200 200 0 1 1 0-400zM452 348a84 84 0 1 0 0 168a84 84 0 1 0 0-168z" />
      </G>
    </Svg>
  );
}

/** The brand mark on its own: 48px on onboarding, 64px on the lock screen. */
export function Logo({ size = 48 }: { size?: 48 | 64 }) {
  return <BrandMark size={size} />;
}
