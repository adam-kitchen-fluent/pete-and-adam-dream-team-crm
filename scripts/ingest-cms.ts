// Ingest CMS Care Compare nursing-home provider data → accounts table.
// Free, public, ~14.7k certified US nursing homes with most of the rubric pre-populated.
// Usage: npm run ingest
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { accounts, rubricFactors, settings } from "../src/lib/db/schema";
import { DEFAULT_FACTORS } from "../src/lib/rubric/defaults";
import { rescoreAccounts } from "../src/lib/rubric/score-accounts";

const DATASET = "4pq5-n9py"; // Nursing homes including rehab services — Provider Information
const BASE = `https://data.cms.gov/provider-data/api/1/datastore/query/${DATASET}/0`;
const PAGE = 500;

type CmsRow = Record<string, string>;

const num = (v: string | undefined): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: string | undefined): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

function mapRow(r: CmsRow) {
  const now = new Date().toISOString();
  return {
    id: r.cms_certification_number_ccn,
    name: r.provider_name?.trim() ?? "Unknown facility",
    address: r.provider_address?.trim() || null,
    city: r.citytown?.trim() || null,
    state: r.state?.trim() || null,
    zip: r.zip_code?.trim() || null,
    phone: r.telephone_number?.trim() || null,
    facilityType: "SNF/NF", // all CMS-certified nursing facilities; ALFs arrive via Apify later
    providerType: r.provider_type || null,
    ownershipType: r.ownership_type || null,
    certifiedBeds: int(r.number_of_certified_beds),
    avgDailyResidents: num(r.average_number_of_residents_per_day),
    chainId: r.chain_id?.trim() || null,
    chainName: r.chain_name?.trim() || null,
    chainSize: int(r.number_of_facilities_in_chain),
    totalNursingTurnover: num(r.total_nursing_staff_turnover),
    rnTurnover: num(r.registered_nurse_turnover),
    adminDepartures: int(r.number_of_administrators_who_have_left_the_nursing_home),
    ownershipChanged12mo: r.provider_changed_ownership_in_last_12_months === "Y" ? 1 : 0,
    overallRating: int(r.overall_rating),
    staffingRating: int(r.staffing_rating),
    qmRating: int(r.qm_rating),
    specialFocus: r.special_focus_status?.trim() || null,
    lat: num(r.latitude),
    lng: num(r.longitude),
    source: "cms",
    createdAt: now,
    updatedAt: now,
  };
}

async function fetchPage(offset: number): Promise<{ rows: CmsRow[]; count: number }> {
  const url = `${BASE}?limit=${PAGE}&offset=${offset}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { results: CmsRow[]; count: number };
      return { rows: json.results, count: json.count };
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function ensureRubric() {
  for (const f of DEFAULT_FACTORS) {
    await db
      .insert(rubricFactors)
      .values({ ...f, active: 1 })
      .onConflictDoNothing();
  }
}

async function main() {
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

  console.log("→ Ensuring rubric v1 factors…");
  await ensureRubric();

  console.log("→ Clearing prior CMS accounts…");
  await db.delete(accounts).where(sql`${accounts.source} = 'cms'`);

  console.log("→ Pulling CMS provider data…");
  const first = await fetchPage(0);
  const total = first.count;
  let fetched = 0;
  const turnovers: number[] = [];

  const insertRows = async (rows: CmsRow[]) => {
    const mapped = rows.map(mapRow).filter((m) => m.id);
    for (const m of mapped)
      if (m.totalNursingTurnover != null) turnovers.push(m.totalNursingTurnover);
    const CHUNK = 400;
    for (let i = 0; i < mapped.length; i += CHUNK) {
      await db.insert(accounts).values(mapped.slice(i, i + CHUNK)).onConflictDoNothing();
    }
    fetched += rows.length;
    process.stdout.write(`\r   ${fetched}/${total} facilities`);
  };

  await insertRows(first.rows);
  for (let offset = PAGE; offset < total; offset += PAGE) {
    const { rows } = await fetchPage(offset);
    await insertRows(rows);
  }
  console.log();

  turnovers.sort((a, b) => a - b);
  const median = turnovers.length ? turnovers[Math.floor(turnovers.length / 2)] : 52;
  await db
    .insert(settings)
    .values({ key: "turnover_median", value: String(median) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(median) } });
  console.log(`→ National nursing-turnover median: ${median}%`);

  console.log("→ Scoring all accounts against rubric v1…");
  const n = await rescoreAccounts();
  console.log(`✓ Ingest complete: ${n} accounts scored.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
