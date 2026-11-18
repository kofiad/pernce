/**
 * Idempotent seed for the server's reference data: the currencies the FX
 * cron tracks and starter FX rates (replaced by the first cron run). Safe to
 * run more than once. Run with: pnpm run db:seed
 */
import "dotenv/config";
import { CURRENCIES } from "@pernce/core/currency";
import { libsqlFromEnv } from "../src/db/libsql";
import { currencies } from "../src/db/schema";
import { upsertExchangeRate } from "../src/db/mutations";

const STARTER_RATES: Record<string, number> = {
  GHS: 1 / 14.6,
  XOF: 1 / 604.5,
  XAF: 1 / 598,
  CAD: 0.7318,
  EUR: 1.08,
  GBP: 1.27,
  NGN: 1 / 1550,
};

async function main() {
  const db = libsqlFromEnv(process.env);
  console.log("Seeding currencies...");
  for (const c of CURRENCIES) {
    await db.insert(currencies).values(c).onConflictDoNothing();
  }

  console.log("Seeding starter exchange rates...");
  for (const [code, rate] of Object.entries(STARTER_RATES)) {
    await upsertExchangeRate(code, rate, "manual", db);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
