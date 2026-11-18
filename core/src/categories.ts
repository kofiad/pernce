export type SpendingType = "essential" | "discretionary";

export type DefaultCategory = {
  name: string;
  kind: "income" | "expense";
  spendingType: SpendingType | null;
  color: string;
  icon: string;
};

/** Keeps each entry's literal `icon`, so every app can check the set
 * against its own icon names (the web app does, in src/lib/categories.ts). */
function defineCategories<const T extends readonly DefaultCategory[]>(categories: T): T {
  return categories;
}

/** Default category set, shared by every user. Colors are token names
 * from tokens.ts / globals.css (pernce_design.md accents).
 *
 * Expense categories are split into essentials (needs you can't easily skip)
 * and discretionary spend (wants you can cut back on), so budgets and
 * analytics can tell "I spent more on groceries" apart from "I ate out more".
 * Array order is the display order (seeded into sort_order). */
export const DEFAULT_CATEGORIES = defineCategories([
  // Essentials
  { name: "Rent & Mortgage", kind: "expense", spendingType: "essential", color: "accent-steel", icon: "home" },
  { name: "Utilities", kind: "expense", spendingType: "essential", color: "accent-teal", icon: "bolt" },
  { name: "Phone & Internet", kind: "expense", spendingType: "essential", color: "accent-cyan", icon: "wifi" },
  { name: "Groceries", kind: "expense", spendingType: "essential", color: "accent-lime", icon: "cart" },
  { name: "Transport", kind: "expense", spendingType: "essential", color: "accent-light-blue", icon: "car" },
  { name: "Vehicle Maintenance", kind: "expense", spendingType: "essential", color: "accent-slate", icon: "wrench" },
  { name: "Health & Medical", kind: "expense", spendingType: "essential", color: "accent-brown", icon: "heart" },
  { name: "Insurance", kind: "expense", spendingType: "essential", color: "accent-blue-link", icon: "shield" },
  { name: "Childcare & Education", kind: "expense", spendingType: "essential", color: "accent-violet", icon: "book" },
  { name: "Debt Repayment", kind: "expense", spendingType: "essential", color: "accent-deep-red", icon: "card" },
  { name: "Family Support", kind: "expense", spendingType: "essential", color: "accent-plum", icon: "users" },
  { name: "Bank & Mobile Money Fees", kind: "expense", spendingType: "essential", color: "stone", icon: "receipt" },

  // Discretionary
  { name: "Dining Out", kind: "expense", spendingType: "discretionary", color: "accent-warning", icon: "food" },
  { name: "Shopping", kind: "expense", spendingType: "discretionary", color: "accent-pink", icon: "bag" },
  { name: "Entertainment", kind: "expense", spendingType: "discretionary", color: "accent-yellow", icon: "play" },
  { name: "Subscriptions", kind: "expense", spendingType: "discretionary", color: "accent-magenta", icon: "repeat" },
  { name: "Personal Care", kind: "expense", spendingType: "discretionary", color: "accent-coral", icon: "sparkle" },
  { name: "Sports & Fitness", kind: "expense", spendingType: "discretionary", color: "accent-light-green", icon: "dumbbell" },
  { name: "Travel", kind: "expense", spendingType: "discretionary", color: "primary", icon: "plane" },
  { name: "Gifts & Donations", kind: "expense", spendingType: "discretionary", color: "accent-danger", icon: "gift" },
  { name: "Other", kind: "expense", spendingType: "discretionary", color: "stone", icon: "more" },

  // Income - earned first, then passive, then money that comes back or in.
  { name: "Salary & Wages", kind: "income", spendingType: null, color: "accent-light-green", icon: "briefcase" },
  { name: "Bonuses & Commissions", kind: "income", spendingType: null, color: "accent-yellow", icon: "trophy" },
  { name: "Freelance & Side Gigs", kind: "income", spendingType: null, color: "accent-cyan", icon: "laptop" },
  { name: "Business & Sales", kind: "income", spendingType: null, color: "accent-teal", icon: "store" },
  { name: "Rental Income", kind: "income", spendingType: null, color: "accent-brown", icon: "key" },
  { name: "Interest & Dividends", kind: "income", spendingType: null, color: "accent-steel", icon: "trend" },
  { name: "Pension & Benefits", kind: "income", spendingType: null, color: "accent-slate", icon: "umbrella" },
  { name: "Remittances Received", kind: "income", spendingType: null, color: "accent-violet", icon: "globe" },
  { name: "Gifts Received", kind: "income", spendingType: null, color: "accent-pink", icon: "gift" },
  { name: "Refunds & Reimbursements", kind: "income", spendingType: null, color: "accent-blue-link", icon: "refund" },
  { name: "Other Income", kind: "income", spendingType: null, color: "stone", icon: "coin" },
]);

export const SPENDING_TYPE_LABELS: Record<SpendingType, string> = {
  essential: "Essentials",
  discretionary: "Discretionary",
};

/** Buckets categories (or anything carrying one) into essentials first,
 * then discretionary, then anything unclassified - dropping empty groups. */
export function groupBySpendingType<T>(items: T[], typeOf: (item: T) => SpendingType | null | undefined) {
  const groups: { key: SpendingType | "other"; label: string; items: T[] }[] = [
    { key: "essential", label: SPENDING_TYPE_LABELS.essential, items: [] },
    { key: "discretionary", label: SPENDING_TYPE_LABELS.discretionary, items: [] },
    { key: "other", label: "Other", items: [] },
  ];
  for (const item of items) {
    const t = typeOf(item);
    groups[t === "essential" ? 0 : t === "discretionary" ? 1 : 2].items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}
