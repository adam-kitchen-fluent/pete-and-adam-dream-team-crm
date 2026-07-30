// Apify connector — Google Maps scraper. Primary use: ALF universe (thin in CMS data).
// STUB: waiting on APIFY_TOKEN from Adam. Interface is final; implementation TODO.
import type { Account } from "../db/schema";
import { ConnectorNotConfiguredError, type EnrichmentConnector, type EnrichmentPatch } from "./types";

export const apifyConnector: EnrichmentConnector = {
  name: "apify",
  ready: () => Boolean(process.env.APIFY_TOKEN),
  async enrichAccount(account: Account): Promise<EnrichmentPatch> {
    if (!this.ready()) throw new ConnectorNotConfiguredError("Apify", "APIFY_TOKEN");
    // TODO(adam): implement via Apify Google Maps actor:
    //   1. discover ALFs by state ("assisted living facility <city, state>") → new accounts
    //   2. reviews/website text → opsMaturity heuristics
    void account;
    throw new Error("Apify connector not implemented yet");
  },
};
