// One interface for all enrichment connectors — swapping stub → live is a drop-in.
import type { Account } from "../db/schema";

export interface ContactRecord {
  name: string;
  title?: string;
  role?: "don" | "administrator" | "owner" | "other";
  email?: string;
  phone?: string;
  linkedinUrl?: string;
}

/** Partial update a connector contributes to an account record. */
export interface EnrichmentPatch {
  pccStatus?: "on_pcc" | "not_on_pcc" | "unknown";
  opsMaturity?: "manual" | "digital" | "unknown";
  donNewHire?: "yes" | "no" | "unknown";
  donTechForward?: "yes" | "no" | "unknown";
  contacts?: ContactRecord[];
  notes?: string;
}

export interface EnrichmentConnector {
  name: string;
  /** True when required API keys are present. */
  ready(): boolean;
  enrichAccount(account: Account): Promise<EnrichmentPatch>;
}

export class ConnectorNotConfiguredError extends Error {
  constructor(connector: string, envVar: string) {
    super(`${connector} connector not configured — set ${envVar} in .env.local`);
    this.name = "ConnectorNotConfiguredError";
  }
}
