import { promises as fs } from "fs";
import path from "path";
import type {
  Opportunity,
  Organization,
  SourceRegistryEntry,
  StudentProfile,
  SearchRunRecord,
} from "../types";

// The entire "database" for the $0 architecture. Every pipeline module goes
// through this file rather than touching data/*.json directly — see
// ARCHITECTURE.md §3. This module is Node-only (fs access): it is imported
// by pipeline scripts run via the CLI/GitHub Actions, never by the static
// dashboard, which instead fetches the same JSON files as plain static
// assets copied into public/data/ (see scripts/copy-data.ts).

const DATA_DIR = path.join(process.cwd(), "data");

async function readJson<T>(fileName: string): Promise<T[]> {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeJson<T>(fileName: string, records: T[]): Promise<void> {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(records, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function getAllSources(): Promise<SourceRegistryEntry[]> {
  return readJson<SourceRegistryEntry>("sources.json");
}

export async function getActiveSources(): Promise<SourceRegistryEntry[]> {
  const sources = await getAllSources();
  return sources.filter((s) => s.active);
}

export async function touchSourceLastChecked(sourceId: string): Promise<void> {
  const sources = await getAllSources();
  const updated = sources.map((s) =>
    s.id === sourceId ? { ...s, last_checked_at: new Date().toISOString() } : s
  );
  await writeJson("sources.json", updated);
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function getOrganizations(): Promise<Organization[]> {
  return readJson<Organization>("organizations.json");
}

export async function findOrganizationByNormalizedName(
  normalizedName: string
): Promise<Organization | null> {
  const orgs = await getOrganizations();
  return orgs.find((o) => o.normalized_name === normalizedName) ?? null;
}

export async function createOrganization(org: Organization): Promise<void> {
  const orgs = await getOrganizations();
  orgs.push(org);
  await writeJson("organizations.json", orgs);
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export async function getOpportunities(): Promise<Opportunity[]> {
  return readJson<Opportunity>("opportunities.json");
}

export async function findOpportunityByDedupHash(hash: string): Promise<Opportunity | null> {
  const opportunities = await getOpportunities();
  return opportunities.find((o) => o.dedup_hash === hash) ?? null;
}

export async function saveOpportunity(opportunity: Opportunity): Promise<void> {
  const opportunities = await getOpportunities();
  const index = opportunities.findIndex((o) => o.id === opportunity.id);
  if (index >= 0) {
    opportunities[index] = opportunity;
  } else {
    opportunities.push(opportunity);
  }
  await writeJson("opportunities.json", opportunities);
}

export async function getAllOpportunitiesForSimilarity(): Promise<
  Pick<Opportunity, "id" | "normalized_title" | "dedup_hash">[]
> {
  const opportunities = await getOpportunities();
  return opportunities.map(({ id, normalized_title, dedup_hash }) => ({
    id,
    normalized_title,
    dedup_hash,
  }));
}

// ---------------------------------------------------------------------------
// Student profiles
// ---------------------------------------------------------------------------

export async function getProfiles(): Promise<StudentProfile[]> {
  return readJson<StudentProfile>("profile.json");
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function getTags(): Promise<string[]> {
  return readJson<string>("tags.json");
}

// ---------------------------------------------------------------------------
// Run history
// ---------------------------------------------------------------------------

export async function appendRun(run: SearchRunRecord): Promise<void> {
  const runs = await readJson<SearchRunRecord>("runs.json");
  runs.push(run);
  await writeJson("runs.json", runs);
}

export async function updateRun(runId: string, patch: Partial<SearchRunRecord>): Promise<void> {
  const runs = await readJson<SearchRunRecord>("runs.json");
  const updated = runs.map((r) => (r.id === runId ? { ...r, ...patch } : r));
  await writeJson("runs.json", updated);
}
