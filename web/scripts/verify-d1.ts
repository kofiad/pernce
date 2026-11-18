/**
 * The same sync server checks as `pnpm run db:verify` (scripts/sync-checks.ts),
 * run against a local Cloudflare D1 in workerd through wrangler's platform
 * proxy, to catch D1-only differences (batch semantics, error shapes, bound
 * parameter limits). No Cloudflare login needed. Run with:
 * pnpm run db:verify:d1
 */
import { localD1 } from "./d1";
import { runSyncChecks } from "./sync-checks";

async function main() {
  console.log("Starting local D1 (workerd)...");
  const d1 = await localD1();
  const failed = await runSyncChecks(d1.db);
  await d1.dispose();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("D1 verification crashed:", err);
  process.exit(1);
});
