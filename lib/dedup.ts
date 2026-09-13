import { createHash } from "crypto";

// Deterministic dedup layer. Semantic (embedding) similarity is handled in
// SQL (pgvector, see supabase/schema.sql) and orchestrated from
// lib/pipeline/deduplicate.ts — this file only holds the parts that must be
// exactly reproducible: normalization and hashing.

const ABBREVIATION_EXPANSIONS: Record<string, string> = {
  corp: "corporation",
  inc: "incorporated",
  co: "company",
  ltd: "limited",
  intl: "international",
  natl: "national",
  univ: "university",
  mgmt: "management",
  dept: "department",
};

/**
 * Lowercases, strips punctuation, collapses whitespace, and expands a small
 * set of known abbreviations. Used identically for organization names,
 * titles, and locations so the resulting strings are comparable.
 */
export function normalize(value: string): string {
  const stripped = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped
    .split(" ")
    .map((word) => ABBREVIATION_EXPANSIONS[word] ?? word)
    .join(" ");
}

export interface DedupKeyInput {
  organizationName: string;
  title: string;
  location?: string | null;
}

/**
 * The canonical dedup hash: same organization + same title + same location
 * (after normalization) is treated as the same opportunity without ever
 * invoking Claude. This is intentionally strict — it is the fast/free path,
 * not the only path. Looser matches are candidates handled by trigram/
 * embedding similarity in lib/pipeline/deduplicate.ts.
 */
export function computeDedupHash(input: DedupKeyInput): string {
  const key = [
    normalize(input.organizationName),
    normalize(input.title),
    normalize(input.location ?? ""),
  ].join("|");

  return createHash("sha256").update(key).digest("hex");
}

/**
 * Content hash used by the discovery cost/effort-control gate: if a
 * source's raw content hashes the same as last time, it never reaches
 * extraction again.
 */
export function computeContentHash(rawContent: string): string {
  return createHash("sha256").update(rawContent.trim()).digest("hex");
}

function bigrams(value: string): string[] {
  const padded = value.replace(/\s+/g, " ").trim();
  const grams: string[] = [];
  for (let i = 0; i < padded.length - 1; i++) {
    grams.push(padded.slice(i, i + 2));
  }
  return grams;
}

/**
 * Dice coefficient (bigram overlap) similarity, 0-1. This is the $0
 * substitute for Postgres pg_trgm similarity used in the optional
 * Supabase-backed path (see OPTIONAL_SCALE_UP.md) — same idea
 * (character-level fuzzy match), computed in plain JS over the in-memory
 * opportunity array, which is fine at the scale a flat-file store targets.
 */
export function diceSimilarity(a: string, b: string): number {
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  if (gramsA.length === 0 || gramsB.length === 0) return gramsA.length === gramsB.length ? 1 : 0;

  const counts = new Map<string, number>();
  for (const gram of gramsA) counts.set(gram, (counts.get(gram) ?? 0) + 1);

  let overlap = 0;
  for (const gram of gramsB) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      overlap++;
      counts.set(gram, remaining - 1);
    }
  }

  return (2 * overlap) / (gramsA.length + gramsB.length);
}
