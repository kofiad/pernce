import { resolveColor } from "@pernce/core";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { PICKABLE_ICONS, hexToHsv, hsvToHex, parseHex, whiteContrast, type HSV } from "../data/look";
import { useT } from "../lib/i18n";
import { FONT, useTheme } from "../lib/theme";
import { Icon } from "./Icon";
import { ChoiceSheet } from "./inputs";
import { Avatar, Button, FieldLabel, InputBox, T, styles as ui, text } from "./ui";

/** The look pickers (artboard colourRow / iconRow, M22a, M22b), shared by
 * the account, category, budget and profile forms. Colours are stored as
 * a token or "#rrggbb"; icons by name (src/data/look.ts). */

/** The artboard's account (and profile) swatches, in its order. */
export const ACCOUNT_COLOURS = [
  "accent-yellow",
  "accent-light-blue",
  "accent-pink",
  "accent-teal",
  "accent-warning",
  "primary",
  "accent-brown",
  "accent-violet",
];

/** The artboard's category (and budget) swatches, in its order. */
export const CATEGORY_COLOURS = [
  "accent-warning",
  "accent-light-blue",
  "accent-pink",
  "accent-teal",
  "accent-yellow",
  "accent-brown",
  "accent-violet",
  "accent-cyan",
];

/** The profile avatar's letter: the name's first, "P" without one. */
export const profileLetters = (name: string) => (name.trim()[0] ?? "P").toUpperCase();

/** The profile's avatar (Home, Settings): its colour, and its icon or
 * the name's first letter. */
export function ProfileAvatar({
  profile,
  size = "sm",
}: {
  profile: { name: string; color: string; icon: string | null };
  size?: "sm" | "md" | "lg";
}) {
  return profile.icon ? (
    <Avatar color={profile.color} icon={profile.icon} size={size} />
  ) : (
    <Avatar color={profile.color} letters={profileLetters(profile.name)} size={size} />
  );
}

/** Icon suggestions per kind of row (the rest are in the icon sheet). */
export const ACCOUNT_ICONS = ["wallet", "card", "coin", "home", "briefcase", "store", "laptop", "globe", "key", "trend"];
export const CATEGORY_ICON_SUGGESTIONS = ["food", "cart", "home", "bolt", "car", "heart", "bag", "play", "plane", "gift", "coin"];
export const PROFILE_ICONS = ["user", "sparkle", "heart", "home", "globe", "coin", "briefcase", "key", "bolt", "play"];

const ring = (canvas: string, fg: string) => ({ boxShadow: `0 0 0 2px ${canvas}, 0 0 0 4px ${fg}` });

/** The colour row: token presets, then the custom swatch (a hue ring
 * around a plus; filled once a custom colour is picked), which opens the
 * colour wheel. */
export function ColorRow({
  value,
  onChange,
  presets,
  icon,
  letters,
  label,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  presets: readonly string[];
  /** Drawn on the wheel's preview avatar: the icon, else the letters. */
  icon?: string | null;
  letters?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const t = useT();
  const [wheel, setWheel] = useState(false);
  // Anything not a preset (a wheel pick, a token set elsewhere) lives in
  // the custom swatch.
  const custom = presets.includes(value) ? null : value;
  return (
    <View style={[{ marginBottom: 20 }, style]}>
      <FieldLabel>{label ?? t.categories.colour}</FieldLabel>
      <View style={s.swatches}>
        {presets.map((token) => (
          <Pressable
            key={token}
            accessibilityRole="button"
            accessibilityLabel={token}
            accessibilityState={{ selected: value === token }}
            onPress={() => onChange(token)}
            style={[s.swatch, { backgroundColor: resolveColor(token) }, value === token ? ring(c.canvas, c.text) : null]}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.look.customColour}
          accessibilityState={{ selected: !!custom }}
          onPress={() => setWheel(true)}
          style={[s.swatch, custom ? [{ backgroundColor: resolveColor(custom) }, ring(c.canvas, c.text)] : null]}
        >
          {custom ? null : <HueRing canvas={c.canvas} color={c.text} />}
        </Pressable>
      </View>
      <ColorWheelSheet
        visible={wheel}
        value={value}
        icon={icon}
        letters={letters}
        onClose={() => setWheel(false)}
        onPick={(hex) => {
          onChange(hex);
          setWheel(false);
        }}
      />
    </View>
  );
}

/** .sw.custom: a 36px hue ring with a plus in the middle. */
function HueRing({ canvas, color }: { canvas: string; color: string }) {
  const slices = useMemo(() => wedges(18, 18, 24), []);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width={36} height={36}>
        {slices.map((w) => (
          <Path key={w.d} d={w.d} fill={w.fill} />
        ))}
        <Circle cx={18} cy={18} r={14} fill={canvas} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.center]}>
        <Icon name="plus" color={color} variant="xs" />
      </View>
    </View>
  );
}

/** Pie wedges round a circle of radius `r` centred at (`c`, `c`), each
 * filled with its hue at full saturation and brightness. Angles run
 * clockwise from 3 o'clock, as the knob's do. */
function wedges(c: number, r: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    // A hair of overlap so no seams show between wedges.
    const a0 = (i / n) * 2 * Math.PI - 0.01;
    const a1 = ((i + 1) / n) * 2 * Math.PI + 0.01;
    const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
    return { d: `M${c} ${c}L${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}Z`, fill: hsvToHex({ h: ((i + 0.5) * 360) / n, s: 1, v: 1 }) };
  });
}

const WHEEL = 248;

/** M22a: hue by angle, saturation by distance from the centre, brightness
 * on the slider; or type a hex code. The preview is the real avatar. */
function ColorWheelSheet({
  visible,
  value,
  icon,
  letters,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string;
  icon?: string | null;
  letters?: string;
  onClose: () => void;
  onPick: (hex: string) => void;
}) {
  const t = useT();
  return (
    <ChoiceSheet visible={visible} title={t.look.customColour} onClose={onClose} scroll={false}>
      {/* Remounted on each open, so it starts from the current colour. */}
      {visible ? <ColorWheel start={resolveColor(value)} icon={icon} letters={letters} onCancel={onClose} onPick={onPick} /> : null}
    </ChoiceSheet>
  );
}

function ColorWheel({
  start,
  icon,
  letters,
  onCancel,
  onPick,
}: {
  start: string;
  icon?: string | null;
  letters?: string;
  onCancel: () => void;
  onPick: (hex: string) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const [hsv, setHsvState] = useState<HSV>(() => hexToHsv(parseHex(start) ?? "#0b7a62"));
  const [hexText, setHexText] = useState(() => hsvToHex(hsv).toUpperCase());
  const [sliderWidth, setSliderWidth] = useState(0);
  const hex = hsvToHex(hsv);
  const hue = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });
  const slices = useMemo(() => wedges(WHEEL / 2, WHEEL / 2, 72), []);

  const setHsv = (next: HSV) => {
    setHsvState(next);
    setHexText(hsvToHex(next).toUpperCase());
  };
  const onWheel = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.locationX - WHEEL / 2;
    const dy = e.nativeEvent.locationY - WHEEL / 2;
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    setHsv({ ...hsv, h, s: Math.min(1, Math.hypot(dx, dy) / (WHEEL / 2)) });
  };
  const onSlider = (e: GestureResponderEvent) => {
    if (sliderWidth > 0) setHsv({ ...hsv, v: Math.max(0, Math.min(1, e.nativeEvent.locationX / sliderWidth)) });
  };
  // The finger keeps the knob: the sheet doesn't scroll and nothing else
  // may take the gesture over.
  const drag = (handler: (e: GestureResponderEvent) => void) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: handler,
    onResponderMove: handler,
    onResponderTerminationRequest: () => false,
  });

  const r = (hsv.s * WHEEL) / 2;
  const rad = (hsv.h * Math.PI) / 180;
  return (
    <View>
      <View style={s.wheel} pointerEvents="box-only" {...drag(onWheel)}>
        <Svg width={WHEEL} height={WHEEL}>
          <Defs>
            <RadialGradient id="sat" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {slices.map((w) => (
            <Path key={w.d} d={w.d} fill={w.fill} />
          ))}
          <Circle cx={WHEEL / 2} cy={WHEEL / 2} r={WHEEL / 2} fill="url(#sat)" />
          <Circle cx={WHEEL / 2} cy={WHEEL / 2} r={WHEEL / 2} fill="#000000" opacity={1 - hsv.v} />
        </Svg>
        <View style={[s.knob, { left: WHEEL / 2 + r * Math.cos(rad) - 14, top: WHEEL / 2 + r * Math.sin(rad) - 14, backgroundColor: hex }]} />
      </View>

      <FieldLabel>{t.look.brightness}</FieldLabel>
      <View style={s.slider} onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)} pointerEvents="box-only" {...drag(onSlider)}>
        <Svg width="100%" height={28} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="val" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#000000" />
              <Stop offset="1" stopColor={hue} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height={28} rx={14} fill="url(#val)" />
        </Svg>
        <View style={[s.knob, { left: hsv.v * sliderWidth - 14, top: 0, backgroundColor: hex }]} />
      </View>

      <View style={s.previewRow}>
        {icon || !letters ? <Avatar color={hex} icon={icon ?? "more"} size="lg" /> : <Avatar color={hex} letters={letters} size="lg" />}
        <View style={ui.grow}>
          <FieldLabel>{t.look.hex}</FieldLabel>
          <InputBox>
            <TextInput
              value={hexText}
              onChangeText={(next) => {
                setHexText(next);
                const parsed = parseHex(next);
                if (parsed) setHsvState(hexToHsv(parsed));
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              keyboardAppearance={c.scheme}
              accessibilityLabel={t.look.hex}
              style={[text.input, { color: c.text, fontFamily: FONT.mono }]}
            />
          </InputBox>
        </View>
      </View>
      {whiteContrast(hex) < 3 ? (
        <T variant="caption" color={c.mute} style={{ marginTop: 8 }}>
          {t.look.lowContrast}
        </T>
      ) : null}
      <View style={{ gap: 12, marginTop: 24 }}>
        <Button label={t.look.useColour} onPress={() => onPick(hex)} />
        <Button label={t.common.cancel} variant="text" onPress={onCancel} />
      </View>
    </View>
  );
}

/** A 44px icon plate in the icon grid: soft, or chip-on when selected. */
function Plate({
  label,
  selected,
  onPress,
  dashed,
  children,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  dashed?: boolean;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.plate,
        dashed
          ? { borderWidth: 1, borderStyle: "dashed", borderColor: c.hairline }
          : { backgroundColor: selected ? c.chipActive : c.soft },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

/** The icon row: suggestions in six columns and a "More" plate that opens
 * the full icon sheet. With `initials`, the first plate is the name's
 * initials, picked by `null`. A picked icon that isn't a suggestion takes
 * the first slot, so the choice is always on screen. */
export function IconRow({
  value,
  onChange,
  suggestions,
  initials,
  style,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  suggestions: readonly string[];
  initials?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const t = useT();
  const [more, setMore] = useState(false);
  const slots = initials !== undefined ? 10 : 11;
  const icons = (value && !suggestions.includes(value) ? [value, ...suggestions] : [...suggestions]).slice(0, slots);
  const cells: React.ReactNode[] = [];
  if (initials !== undefined) {
    cells.push(
      <Plate key="initials" label={t.look.initials} selected={value === null} onPress={() => onChange(null)}>
        <Text style={[text.avatar, { fontSize: 13, color: value === null ? c.chipActiveText : c.softText }]}>{initials}</Text>
      </Plate>,
    );
  }
  for (const name of icons) {
    cells.push(
      <Plate key={name} label={name} selected={value === name} onPress={() => onChange(name)}>
        <Icon name={name} color={value === name ? c.chipActiveText : c.softText} variant="s" />
      </Plate>,
    );
  }
  cells.push(
    <Plate key="more" label={t.look.moreIcons} onPress={() => setMore(true)} dashed>
      <Icon name="search" color={c.text} variant="s" />
    </Plate>,
  );
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < cells.length; i += 6) rows.push(cells.slice(i, i + 6));
  return (
    <View style={[{ marginBottom: 24 }, style]}>
      <FieldLabel>{t.categories.icon}</FieldLabel>
      <View style={{ gap: 10 }}>
        {rows.map((row, r) => (
          <View key={r} style={s.iconRow}>
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={[ui.grow, s.center]}>
                {row[i] ?? null}
              </View>
            ))}
          </View>
        ))}
      </View>
      <IconSheet
        visible={more}
        value={value}
        onClose={() => setMore(false)}
        onPick={(name) => {
          onChange(name);
          setMore(false);
        }}
      />
    </View>
  );
}

/** M22b: every pickable icon, searchable by name. */
function IconSheet({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const icons = q ? PICKABLE_ICONS.filter((name) => name.replace(/-/g, " ").includes(q)) : PICKABLE_ICONS;
  return (
    <ChoiceSheet visible={visible} title={t.look.chooseIcon} onClose={onClose} scroll={false} fill>
      <InputBox lead={<Icon name="search" color={c.placeholder} variant="s" />} style={{ marginBottom: 16 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.look.searchIcons}
          placeholderTextColor={c.placeholder}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardAppearance={c.scheme}
          style={[text.input, { color: c.text }]}
        />
      </InputBox>
      <FlatList
        data={icons}
        keyExtractor={(name) => name}
        numColumns={6}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
        ListEmptyComponent={
          <T variant="bodySm" color={c.mute}>
            {t.look.noIcons}
          </T>
        }
        renderItem={({ item }) => (
          <View style={[ui.grow, s.center, { maxWidth: `${100 / 6}%` }]}>
            <Plate label={item} selected={value === item} onPress={() => onPick(item)}>
              <Icon name={item} color={value === item ? c.chipActiveText : c.softText} variant="s" />
            </Plate>
          </View>
        )}
      />
    </ChoiceSheet>
  );
}

const s = StyleSheet.create({
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 4, margin: -4 },
  swatch: { width: 36, height: 36, borderRadius: 18, overflow: "visible" },
  center: { alignItems: "center", justifyContent: "center" },
  wheel: { width: WHEEL, height: WHEEL, alignSelf: "center", marginTop: 8, marginBottom: 24 },
  knob: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#ffffff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.3)",
  },
  slider: { height: 28, borderRadius: 14, marginBottom: 24 },
  previewRow: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  plate: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  iconRow: { flexDirection: "row", gap: 10 },
});
