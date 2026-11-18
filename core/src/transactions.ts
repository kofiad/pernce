import { roundMoney } from "./money";

export type TransactionType = "income" | "expense" | "transfer";

export type TransactionInput = {
  accountId: string;
  categoryId?: string | null;
  transferAccountId?: string | null;
  type: TransactionType;
  amount: number;
  currency: string;
  /** Transfers only: what the destination receives, in its currency. */
  transferAmount?: number | null;
  /** Transfers only: 1 unit of `currency` = `exchangeRate` of the destination's. */
  exchangeRate?: number | null;
  /** Transfers only: fee in `currency`, debited from the source on top of `amount`. */
  fee?: number | null;
  note?: string | null;
  occurredAt: string; // ISO date
};

/** A TransactionInput after resolveTransactionInput(): every transfer-only
 * field is settled, so balanceDeltas and storage never have to guess. Also
 * what a stored row is read back into for reversal. */
export type ResolvedTransaction = Omit<TransactionInput, "transferAmount" | "exchangeRate" | "fee"> & {
  transferAmount: number | null;
  transferCurrency: string | null;
  exchangeRate: number | null;
  fee: number;
};

/** The only account fields resolution needs. Callers look these up
 * scoped to the current user, and pass null for an account that doesn't
 * exist or isn't theirs. */
export type AccountRef = { id: string; currency: string };

export type ResolveOptions = {
  /** Rounds a transfer's derived amount received (amount x rate) in the
   * destination currency. Defaults to cents; both apps pass
   * roundToCurrency so it follows the destination's precision. */
  round?: (n: number, currency: string) => number;
};

export function isPositiveFinite(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** True when resolving `input` needs the destination account looked up -
 * lets callers skip that lookup for anything that will be rejected, or
 * isn't a transfer, before it gets that far. */
export function needsTransferDestination(input: Pick<TransactionInput, "type" | "accountId" | "transferAccountId">) {
  return input.type === "transfer" && !!input.transferAccountId && input.transferAccountId !== input.accountId;
}

/** Validates a transaction against its (already ownership-checked) source
 * and destination accounts, then settles the transfer-only fields.
 *
 * The transaction's currency must match the source account's currency. An
 * account's balance is a running *native-currency* total and balanceDeltas
 * adds/subtracts verbatim with no FX conversion, so a mismatched currency
 * wouldn't fail, it would just silently post the wrong-currency amount into
 * the balance. For the same reason the destination's side of a transfer is
 * always recorded in the destination account's own currency
 * (transferCurrency is taken from the account, never the caller):
 * - same currency: transferAmount is forced to `amount`, no rate stored.
 * - different currencies: at least one of transferAmount / exchangeRate is
 *   required; the other is derived from it. When both are given they're
 *   stored as-is - they're the user's record of what the provider actually
 *   did, which won't always round-trip exactly. */
export function resolveTransactionInput(
  input: TransactionInput,
  source: AccountRef | null | undefined,
  dest: AccountRef | null | undefined,
  { round = roundMoney }: ResolveOptions = {},
): ResolvedTransaction {
  if (!source) throw new Error("Account not found");
  if (source.currency !== input.currency) {
    throw new Error(
      `Transaction currency (${input.currency}) does not match account currency (${source.currency})`,
    );
  }
  if (!isPositiveFinite(input.amount)) throw new Error("Amount must be a positive number");

  const base = {
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    note: input.note ?? null,
    occurredAt: input.occurredAt,
  };

  if (input.type !== "transfer") {
    return { ...base, transferAccountId: null, transferAmount: null, transferCurrency: null, exchangeRate: null, fee: 0 };
  }

  // A transfer with no destination would pass through balanceDeltas'
  // transfer branch as a silent no-op - written to the ledger but with zero
  // effect on any balance. Reject it here instead of letting that
  // inconsistency happen quietly.
  if (!input.transferAccountId) throw new Error("Transfer destination account is required");
  if (input.transferAccountId === input.accountId) throw new Error("Cannot transfer to the same account");
  if (!dest) throw new Error("Transfer destination account not found");

  const fee = input.fee ?? 0;
  if (!Number.isFinite(fee) || fee < 0) throw new Error("Fee must be zero or a positive number");

  let transferAmount: number;
  let exchangeRate: number | null;
  if (dest.currency === input.currency) {
    transferAmount = input.amount;
    exchangeRate = null;
  } else {
    const hasAmount = isPositiveFinite(input.transferAmount);
    const hasRate = isPositiveFinite(input.exchangeRate);
    if (!hasAmount && !hasRate) {
      throw new Error(
        `Transfer from ${input.currency} to ${dest.currency} needs the amount received or the exchange rate used`,
      );
    }
    transferAmount = hasAmount ? input.transferAmount! : round(input.amount * input.exchangeRate!, dest.currency);
    exchangeRate = hasRate ? input.exchangeRate! : transferAmount / input.amount;
    if (!isPositiveFinite(transferAmount)) throw new Error("Amount received rounds to zero");
  }

  return {
    ...base,
    categoryId: null,
    transferAccountId: input.transferAccountId,
    transferAmount,
    transferCurrency: dest.currency,
    exchangeRate,
    fee,
  };
}

export type BalanceDelta = { accountId: string; delta: number };

/** How a transaction moves account balances, each in that account's own
 * currency: income adds to the account, expense subtracts, a transfer
 * subtracts `amount + fee` from the source and adds `transferAmount`
 * (already in the destination's currency) to the destination.
 *
 * The web app applies these to its stored running balances (negated to
 * reverse a transaction); the mobile app sums them over the ledger to
 * derive balances, which is what keeps them correct across sync. */
export function balanceDeltas(
  t: Pick<ResolvedTransaction, "type" | "accountId" | "transferAccountId" | "amount" | "fee" | "transferAmount">,
): BalanceDelta[] {
  if (t.type === "income") return [{ accountId: t.accountId, delta: t.amount }];
  if (t.type === "expense") return [{ accountId: t.accountId, delta: -t.amount }];
  if (t.type === "transfer" && t.transferAccountId && t.transferAmount !== null) {
    return [
      { accountId: t.accountId, delta: -(t.amount + t.fee) },
      { accountId: t.transferAccountId, delta: t.transferAmount },
    ];
  }
  return [];
}
