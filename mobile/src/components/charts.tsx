import * as Haptics from "expo-haptics";
import { useEffect, useId, useMemo, useRef, useState, type ComponentRef } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Polyline, Stop, Text as SvgText } from "react-native-svg";
import { useT } from "../lib/i18n";
import { fmtAxis, fmtMajor } from "../lib/money";
import { FONT, radius, useTheme } from "../lib/theme";
import { Between, Dot, Inline, T } from "./ui";

/** The artboard's charts (donut, trend, line, exposure), drawn with
 * react-native-svg. */

/** "34", or "1.6" for a sliver. */
const fmtPct = (pct: number) => (pct >= 2 || pct === 0 ? String(Math.round(pct)) : pct.toFixed(1));

function useWidth(initial = 310) {
  const [width, setWidth] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width));
  return { width, onLayout };
}

export type Slice = {
  key: string;
  label: string;
  color: string;
  pct: number;
  amount?: string;
  /** Opens what the slice stands for (a category's spending, M07b). */
  onOpen?: () => void;
};

/** Where (x, y) lands on a donut: a slice index, the hole, or outside. */
function donutHit(parts: Slice[], size: number, stroke: number, x: number, y: number): number | "hole" | null {
  const r = (size - stroke) / 2;
  const dx = x - size / 2;
  const dy = y - size / 2;
  const d = Math.hypot(dx, dy);
  if (d < r - stroke / 2) return "hole";
  if (d > r + stroke / 2 + 6 || parts.length === 0) return null;
  // Clockwise from 12 o'clock, in percent of the ring.
  const turn = ((Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1) * 100;
  let end = 0;
  for (let i = 0; i < parts.length; i++) {
    end += parts[i].pct;
    if (turn < end) return i;
  }
  return parts.length - 1;
}

/** Picking a slice or legend row: a tap on another one picks it. On the
 * web, where a mouse has already picked it by pointing, a click on the
 * picked one opens it; on a phone a tap on it lets go. */
function pickOrOpen(parts: Slice[], i: number, picked: number | null, onPick: (i: number | null) => void) {
  if (i !== picked) onPick(i);
  else if (Platform.OS === "web") parts[i].onOpen?.();
  else onPick(null);
}

/** donut(): a ring with 2px gaps between slices, from 12 o'clock. Given
 * `onPick`, a slice can be picked (M10b): the rest dim to 30% and the hole
 * shows its label, amount and share, plus View when it has `onOpen`; a
 * tap on the hole opens it. A mouse picks by pointing (W06a). */
export function Donut({
  parts,
  size = 120,
  stroke = 14,
  picked = null,
  onPick,
}: {
  parts: Slice[];
  size?: number;
  stroke?: number;
  picked?: number | null;
  onPick?: (i: number | null) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((sum, p) => sum + (circ * p.pct) / 100, 0));
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    // react-native-web renders the View as a DOM element.
    const el = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !onPick || !el?.addEventListener) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = el.getBoundingClientRect();
      const hit = donutHit(parts, size, stroke, e.clientX - box.left, e.clientY - box.top);
      if (typeof hit === "number") onPick(hit);
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [parts, size, stroke, onPick]);

  const sel = picked !== null ? parts[picked] : undefined;
  const ring = (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* A transform string: rotation / origin write an invalid
          transform-origin attribute on the web. */}
      <G transform={`rotate(-90 ${cx} ${cx})`}>
        {parts.length === 0 ? <Circle cx={cx} cy={cx} r={r} fill="none" stroke={c.track} strokeWidth={stroke} /> : null}
        {parts.map((p, i) => (
          <Circle
            key={p.key}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth={stroke}
            strokeDasharray={`${Math.max((circ * p.pct) / 100 - 2, 0)} ${circ}`}
            strokeDashoffset={-starts[i]}
            opacity={sel && i !== picked ? 0.3 : 1}
          />
        ))}
      </G>
    </Svg>
  );
  if (!onPick) return ring;
  return (
    <View
      ref={ref}
      style={{ width: size, height: size }}
      onStartShouldSetResponder={() => true}
      onResponderRelease={(e) => {
        const hit = donutHit(parts, size, stroke, e.nativeEvent.locationX, e.nativeEvent.locationY);
        if (hit === "hole") sel?.onOpen?.();
        else if (hit === null) onPick(null);
        else pickOrOpen(parts, hit, picked, onPick);
      }}
    >
      {ring}
      {sel ? (
        <View pointerEvents="none" style={[s.hole, { padding: stroke + size * 0.06 }]}>
          <T variant="caption" color={c.mute} numberOfLines={1}>
            {sel.label}
          </T>
          {sel.amount ? (
            <T variant={size > 150 ? "heading" : "bodyBold"} num numberOfLines={1}>
              {sel.amount}
            </T>
          ) : null}
          <T variant="caption" color={c.mute} num numberOfLines={1}>
            {fmtPct(sel.pct)}%{sel.onOpen ? " · " : ""}
            {sel.onOpen ? <T variant="caption" color={c.link} style={{ fontFamily: FONT["600"] }}>{t.analytics.view}</T> : null}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** legend(): "● Food & Dining … 34%" rows, 10px apart. Given `onPick`,
 * rows pick their slice like the donut does: the others dim to 40% and
 * the picked one turns semibold; a mouse picks by pointing. */
export function Legend({ parts, picked = null, onPick }: { parts: Slice[]; picked?: number | null; onPick?: (i: number | null) => void }) {
  const { c } = useTheme();
  return (
    <View style={s.legend}>
      {parts.map((p, i) => {
        const on = picked === i;
        const row = (
          <Between style={{ opacity: picked !== null && !on ? 0.4 : 1 }}>
            <Inline gap={8} style={{ flexShrink: 1 }}>
              <Dot color={p.color} />
              <T variant="bodySm" numberOfLines={1} style={[{ flexShrink: 1 }, on ? { fontFamily: FONT["600"] } : null]}>
                {p.label}
              </T>
            </Inline>
            <T variant="bodySm" color={on ? c.text : c.mute} num style={on ? { fontFamily: FONT["600"] } : null}>
              {p.amount && !onPick ? `${p.amount} · ` : ""}
              {fmtPct(p.pct)}%
            </T>
          </Between>
        );
        if (!onPick) return <View key={p.key}>{row}</View>;
        return (
          <Pressable
            key={p.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${p.label}, ${p.amount ? `${p.amount}, ` : ""}${fmtPct(p.pct)}%`}
            onPress={() => pickOrOpen(parts, i, picked, onPick)}
            onHoverIn={() => onPick(i)}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A donut and its legend with one picked slice between them (M10b,
 * W06a). Leaving both with the mouse lets go; with keyboard focus the
 * arrow keys step through the slices, Enter opens the picked one and Esc
 * lets go. Each new pick ticks a selection haptic. */
export function DonutPicker({
  parts,
  size,
  stroke,
  gap,
  picked,
  onPick,
  label,
}: {
  parts: Slice[];
  size: number;
  stroke: number;
  gap: number;
  picked: number | null;
  onPick: (i: number | null) => void;
  label?: string;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (picked !== null) Haptics.selectionAsync().catch(() => {});
  }, [picked]);
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !el?.addEventListener) return;
    const last = parts.length - 1;
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !el.matches(":focus-visible")) onPick(null);
    };
    const key = (e: KeyboardEvent) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (step !== undefined && last >= 0) onPick(picked === null ? 0 : Math.min(last, Math.max(0, picked + step)));
      else if (e.key === "Home" && last >= 0) onPick(0);
      else if (e.key === "End" && last >= 0) onPick(last);
      else if (e.key === "Enter" && picked !== null) parts[picked]?.onOpen?.();
      else if (e.key === "Escape" && picked !== null) onPick(null);
      else return;
      e.preventDefault();
    };
    // Only for the keyboard: a click focuses too, and the pointer handles that.
    const focus = () => {
      if (last >= 0 && el.matches(":focus-visible")) onPick(picked ?? 0);
    };
    const blur = () => onPick(null);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("keydown", key);
    el.addEventListener("focus", focus);
    el.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("keydown", key);
      el.removeEventListener("focus", focus);
      el.removeEventListener("blur", blur);
    };
  }, [parts, picked, onPick]);
  return (
    <View ref={ref} tabIndex={Platform.OS === "web" ? 0 : undefined} accessibilityLabel={label} style={[s.picker, { gap }]}>
      <Donut parts={parts} size={size} stroke={stroke} picked={picked} onPick={onPick} />
      <Legend parts={parts} picked={picked} onPick={onPick} />
    </View>
  );
}

/** Round gridline values covering [lo, hi], about `n` steps apart. A
 * `fit` axis (not from 0) keeps them at least 1% of the value apart and
 * skips 2.5 steps, so labels stay short ("$20.1k", never "$20.25k"). */
function niceTicks(lo: number, hi: number, n = 3, fit = false) {
  if (hi <= lo) hi = lo + 1;
  let raw = (hi - lo) / n;
  if (fit) raw = Math.max(raw, 10 ** (Math.floor(Math.log10(Math.max(Math.abs(lo), Math.abs(hi), 1))) - 2));
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 && !fit ? 2.5 : f <= 5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) out.push(v);
  return out;
}

export type TrendSeries = { name: string; color: string; values: number[] };

const GUTTER_R = 40;
const TOP = 8;
const READOUT_W = 196;

/** trend(): change over time. Gridlines on round values, labelled short in
 * a 40px right gutter; `axis` labels underneath. One series: a 2.5px
 * primary line over a fading fill, dot on the latest point. Several: 2px
 * lines. The value axis starts at 0 unless `fit`. `slots` > points leaves
 * the rest of a part-finished period empty.
 *
 * Press and drag to scrub (M10a): the readout snaps to the nearest point
 * and floats above the plot, centred on the finger, listing every series
 * plus `extra` rows. Horizontal drags scrub, vertical ones still scroll; a
 * selection haptic ticks on each new point. Lifting the finger hides it.
 * On the web a mouse needs no press: the readout follows the pointer over
 * the plot and hides when it leaves (W06). The plot also takes keyboard
 * focus: it opens on the latest point, the arrow keys (and Home / End)
 * step through the points, and leaving hides it. */
export function Trend({
  series,
  currency,
  axis,
  title,
  slots,
  fit,
  extra,
  height = 140,
  label,
}: {
  series: TrendSeries[];
  currency: string;
  /** [point index, label] */
  axis: [number, string][];
  /** Readout heading for a point. */
  title: (i: number) => string;
  slots?: number;
  fit?: boolean;
  extra?: (i: number) => [value: string, label: string][];
  height?: number;
  /** What the chart shows, for screen readers and keyboard users. */
  label?: string;
}) {
  const { c } = useTheme();
  // useId() has colons, which an SVG url(#…) reference can't take.
  const gradientId = `trend${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { width, onLayout } = useWidth();
  const [scrub, setAt] = useState<number | null>(null);
  const h = height;
  const n = series[0]?.values.length ?? 0;
  const span = Math.max(slots ?? n, n);
  const pw = Math.max(1, width - GUTTER_R);
  // The data can shrink under a held finger (a range change).
  const at = scrub !== null && scrub < n ? scrub : null;
  const x = (i: number) => (span < 2 ? pw / 2 : 4 + (i * (pw - 8)) / (span - 1));

  // Tick on each new point, not on the press that starts scrubbing.
  const prevAt = useRef<number | null>(null);
  useEffect(() => {
    if (at !== null && prevAt.current !== null) Haptics.selectionAsync().catch(() => {});
    prevAt.current = at;
  }, [at]);
  const touchRef = useRef<ComponentRef<typeof View>>(null);
  const pick = useMemo(
    () => (lx: number) => {
      if (n === 0) return;
      setAt(span < 2 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((lx - 4) / (pw - 8)) * (span - 1)))));
    },
    [pw, span, n],
  );
  useEffect(() => {
    // react-native-web renders the View as a DOM element.
    const el = touchRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !el?.addEventListener) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse") pick(e.clientX - el.getBoundingClientRect().left);
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setAt(null);
    };
    const last = n - 1;
    const key = (e: KeyboardEvent) => {
      if (n === 0) return;
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (e.key === "Home") setAt(0);
      else if (e.key === "End") setAt(last);
      else if (step !== undefined) setAt((prev) => (prev === null || prev > last ? last : Math.min(last, Math.max(0, prev + step))));
      else return;
      e.preventDefault();
    };
    // Only for the keyboard: a click focuses too, and the pointer handles that.
    const focus = () => {
      if (n > 0 && el.matches(":focus-visible")) setAt(n - 1);
    };
    const blur = () => setAt(null);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("keydown", key);
    el.addEventListener("focus", focus);
    el.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("keydown", key);
      el.removeEventListener("focus", focus);
      el.removeEventListener("blur", blur);
    };
  }, [pick, n]);
  const pan = useMemo(() => {
    const end = () => setAt(null);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
      // Until the finger has moved sideways, a vertical drag belongs to the scroll view.
      onPanResponderTerminationRequest: (_, g) => Math.abs(g.dx) <= Math.abs(g.dy),
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, [pick]);

  if (n === 0) return <View onLayout={onLayout} style={{ height: TOP + h + 24 }} />;
  const one = series.length === 1;
  const all = series.flatMap((sr) => sr.values);
  const ticks = niceTicks(fit ? Math.min(...all) : Math.min(0, ...all), Math.max(...all), 3, fit);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const y = (v: number) => TOP + h - ((v - y0) / (y1 - y0)) * h;
  const pts = (vs: number[]) => vs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const cx = at === null ? 0 : x(at);

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={TOP + h + 24}>
        {ticks.map((t) => {
          const gy = Math.round(y(t)) + 0.5;
          return (
            <G key={t}>
              <Line x1={0} x2={pw} y1={gy} y2={gy} stroke={c.grid} strokeWidth={1} />
              <SvgText x={width} y={gy + 4} textAnchor="end" fontSize={11} fill={c.stone} fontFamily={FONT["400"]}>
                {fmtAxis(t, currency, ticks[1] - ticks[0])}
              </SvgText>
            </G>
          );
        })}
        {axis.map(([i, label]) => {
          const ax = x(i);
          const anchor = ax < 14 ? "start" : ax > pw - 14 ? "end" : "middle";
          return (
            <SvgText
              key={i}
              x={anchor === "start" ? 0 : anchor === "end" ? pw : ax}
              y={TOP + h + 18}
              textAnchor={anchor}
              fontSize={12}
              fill={c.stone}
              fontFamily={FONT["400"]}
            >
              {label}
            </SvgText>
          );
        })}
        {one && n > 1 ? (
          <>
            <Defs>
              <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor={series[0].color} stopOpacity={0.16} />
                <Stop offset="1" stopColor={series[0].color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={`M${pts(series[0].values).join("L")}L${x(n - 1)},${TOP + h}L${x(0)},${TOP + h}Z`} fill={`url(#${gradientId})`} />
          </>
        ) : null}
        {series.map((sr) => (
          <Polyline
            key={sr.name}
            points={pts(sr.values).join(" ")}
            fill="none"
            stroke={sr.color}
            strokeWidth={one ? 2.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {one && at === null ? (
          <Circle cx={x(n - 1)} cy={y(series[0].values[n - 1])} r={4} fill={series[0].color} stroke={c.card} strokeWidth={2} />
        ) : null}
        {at !== null ? (
          <>
            <Line x1={cx} x2={cx} y1={TOP} y2={TOP + h} stroke={c.text} strokeOpacity={0.35} strokeWidth={1} />
            {series.map((sr) => (
              <Circle key={sr.name} cx={cx} cy={y(sr.values[at])} r={4} fill={sr.color} stroke={c.card} strokeWidth={2} />
            ))}
          </>
        ) : null}
      </Svg>
      <View
        ref={touchRef}
        tabIndex={Platform.OS === "web" ? 0 : undefined}
        accessibilityLabel={label}
        style={[s.touch, { width: pw, height: TOP + h, borderRadius: radius.sm }]}
        {...pan.panHandlers}
      />
      {at !== null ? (
        <View
          pointerEvents="none"
          style={[s.readout, { backgroundColor: c.text, left: Math.max(0, Math.min(cx - READOUT_W / 2, width - READOUT_W)), bottom: h + 32 }]}
        >
          <Text style={[s.readoutText, { color: c.canvas, opacity: 0.72, marginBottom: 2 }]}>{title(at)}</Text>
          {series.map((sr) => (
            <ReadoutRow key={sr.name} color={sr.color} value={fmtMajor(sr.values[at], currency)} label={sr.name} />
          ))}
          {extra?.(at).map(([value, label]) => <ReadoutRow key={label} value={value} label={label} />)}
        </View>
      ) : null}
    </View>
  );
}

function ReadoutRow({ color, value, label }: { color?: string; value: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={s.readoutRow}>
      {color ? <View style={[s.key, { backgroundColor: color }]} /> : null}
      <Text style={[s.readoutText, { color: c.canvas, fontFamily: FONT["600"], fontVariant: ["tabular-nums"] }]}>{value}</Text>
      <Text style={[s.readoutText, { color: c.canvas, opacity: 0.72 }]}>{label}</Text>
    </View>
  );
}

/** .lkey: a line swatch for trend legends. */
export function LineKey({ color }: { color: string }) {
  return <View style={{ width: 12, height: 2.5, borderRadius: 2, backgroundColor: color }} />;
}

/** line(): a 2.5px primary line over a 12% fill and three gridlines, with
 * a dot on the latest point. Highest value sits at 14/90 of the height,
 * lowest at 70/90, as in the artboard. */
export function TrendLine({ values, height = 100 }: { values: number[]; height?: number }) {
  const { c } = useTheme();
  const { width, onLayout } = useWidth();
  const h = height;
  if (values.length === 0) return <View onLayout={onLayout} style={{ height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const xs = values.map((_, i) => (values.length === 1 ? width : (i * width) / (values.length - 1)));
  const ys = values.map((v) => ((span === 0 ? 42 : 70 - ((v - min) / span) * 56) * h) / 90);
  const poly = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={h}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={f} x1={0} x2={width} y1={h * f} y2={h * f} stroke={c.grid} strokeWidth={1} />
        ))}
        <Polygon points={`0,${h} ${poly} ${width},${h}`} fill={c.primary} opacity={0.12} />
        <Polyline points={poly} fill="none" stroke={c.primary} strokeWidth={2.5} strokeLinejoin="round" />
        <Circle cx={Math.min(xs[last], width - 4)} cy={ys[last]} r={4} fill={c.primary} />
      </Svg>
    </View>
  );
}

/** exposure(): one 12px stacked bar (2px gaps) and a legend of
 * "● USD … $16,533.55 · 85%". */
export function ExposureBar({ parts }: { parts: Slice[] }) {
  return (
    <View>
      <View style={s.exposure}>
        {parts.map((p) => (
          <View key={p.key} style={{ width: `${p.pct}%`, backgroundColor: p.color }} />
        ))}
      </View>
      <Legend parts={parts} />
    </View>
  );
}

const s = StyleSheet.create({
  legend: { flex: 1, gap: 10 },
  hole: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: 1 },
  picker: { flexDirection: "row", alignItems: "center" },
  touch: { position: "absolute", left: 0, top: 0 },
  readout: {
    position: "absolute",
    zIndex: 2,
    width: READOUT_W,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  readoutRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  readoutText: { fontFamily: FONT["400"], fontSize: 12, lineHeight: 16 },
  key: { width: 10, height: 3, borderRadius: 2 },
  exposure: { flexDirection: "row", height: 12, borderRadius: 9999, overflow: "hidden", gap: 2, marginBottom: 14 },
});
