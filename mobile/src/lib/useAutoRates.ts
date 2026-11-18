import { useEffect } from "react";
import { lastRatesFetch, refreshMarketRates } from "../data/rates";
import { db } from "../db/client";

const STALE_MS = 12 * 60 * 60 * 1000;
let attempted = false;

/** Once per launch, fetch today's rates if the stored ones are older than
 * 12 hours. Failing (offline) is silent: stored rates stay in use. */
export function useAutoRates() {
  useEffect(() => {
    if (attempted) return;
    attempted = true;
    const last = lastRatesFetch(db);
    if (last && Date.now() - new Date(last).getTime() < STALE_MS) return;
    refreshMarketRates(db).catch(() => {});
  }, []);
}
