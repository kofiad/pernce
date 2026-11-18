import type { BudgetWithProgress } from "../data/budgets";
import type { Messages } from "../i18n";
import { fmtShort } from "./money";

export type Health = "ok" | "near" | "over";

/** Over the limit, past 70% of it, or on track. The artboard draws 70%
 * itself as on track and 77% as near the limit. */
export function healthOf(b: Pick<BudgetWithProgress, "over" | "pct">): Health {
  return b.over ? "over" : b.pct > 70 ? "near" : "ok";
}

/** A budget's status line: "Over by $90", "Near limit · $45 left", "On
 * track · $90 left". */
export function statusLabel(b: Pick<BudgetWithProgress, "over" | "pct" | "remaining" | "currency">, t: Messages) {
  const state = healthOf(b);
  const left = fmtShort(b.remaining, b.currency);
  return state === "over"
    ? t.budgets.overBy(fmtShort(-b.remaining, b.currency))
    : state === "near"
      ? t.budgets.nearLimit(left)
      : t.budgets.onTrack(left);
}

/** The worst state among the budgets and its summary ("1 near limit · 1
 * over", "1 over budget", "All on track"). */
export function summarize(budgets: Pick<BudgetWithProgress, "over" | "pct">[], t: Messages, { short = false } = {}) {
  const over = budgets.filter((b) => healthOf(b) === "over").length;
  const near = budgets.filter((b) => healthOf(b) === "near").length;
  const state: Health = over > 0 ? "over" : near > 0 ? "near" : "ok";
  const parts = [
    near > 0 ? t.budgets.nearCount(near) : null,
    over > 0 ? (short || near > 0 ? t.budgets.overCount(over) : t.budgets.overBudgetCount(over)) : null,
  ];
  return { state, label: parts.filter(Boolean).join(" · ") || t.budgets.allOnTrack };
}
