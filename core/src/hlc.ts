/** Hybrid logical clock for last-writer-wins sync (docs/mobile-scope.md §5).
 *
 * A timestamp is a string that sorts in time order with a plain string
 * compare, so SQLite can ORDER BY / MAX() it and the sync server can compare
 * without parsing:
 *
 *   "<wall ms, 13 digits>-<counter, 4 hex>-<node id>"
 *   e.g. "1790000000000-0000-3f2a9c1e"
 *
 * The wall part is the larger of the device clock and the last timestamp
 * this node issued, so a clock that jumps backwards never produces a
 * timestamp older than one already written. The counter orders writes
 * inside the same millisecond; the node id breaks ties between devices. */

export type Hlc = { wall: number; counter: number; node: string };

const WALL_DIGITS = 13;
const COUNTER_DIGITS = 4;
const MAX_COUNTER = 16 ** COUNTER_DIGITS - 1;

export function formatHlc({ wall, counter, node }: Hlc): string {
  return `${String(wall).padStart(WALL_DIGITS, "0")}-${counter.toString(16).padStart(COUNTER_DIGITS, "0")}-${node}`;
}

export function parseHlc(s: string): Hlc {
  const m = /^(\d{13})-([0-9a-f]{4})-(.+)$/.exec(s);
  if (!m) throw new Error(`Not an HLC timestamp: ${s}`);
  return { wall: Number(m[1]), counter: parseInt(m[2], 16), node: m[3] };
}

/** The timestamp for a new local write, given the last one this node
 * issued (null on first use) and the device clock. */
export function tickHlc(last: string | null, node: string, nowMs: number = Date.now()): string {
  const prev = last ? parseHlc(last) : null;
  if (!prev || nowMs > prev.wall) return formatHlc({ wall: nowMs, counter: 0, node });
  if (prev.counter < MAX_COUNTER) return formatHlc({ wall: prev.wall, counter: prev.counter + 1, node });
  // 65k writes in one millisecond: borrow the next millisecond.
  return formatHlc({ wall: prev.wall + 1, counter: 0, node });
}
