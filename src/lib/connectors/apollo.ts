// Apollo connector — contacts layer (find the DON/administrator, emails, LinkedIn).
// STUB: waiting on APOLLO_API_KEY from Adam. Interface is final; implementation TODO.
import type { Account } from "../db/schema";
import { ConnectorNotConfiguredError, type EnrichmentConnector, type EnrichmentPatch } from "./types";

export const apolloConnector: EnrichmentConnector = {
  name: "apollo",
  ready: () => Boolean(process.env.APOLLO_API_KEY),
  async enrichAccount(account: Account): Promise<EnrichmentPatch> {
    if (!this.ready()) throw new ConnectorNotConfiguredError("Apollo", "APOLLO_API_KEY");
    // TODO(adam): implement against Apollo API:
    //   1. org search by name + city/state → org id, employee count
    //   2. people search: titles ["Director of Nursing","DON","Administrator"] → contacts
    //   3. donNewHire: person.employment_history start date < 6 months ago
    //   4. pccStatus: org tech tags / job postings mentioning PointClickCare
    void account;
    throw new Error("Apollo connector not implemented yet");
  },
};
