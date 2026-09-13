import { computeDedupHash, diceSimilarity, normalize } from "../dedup";
import type { OpportunityExtractionResult } from "../claude/schemas";
import type { Opportunity } from "../types";

const SIMILARITY_AUTO_MATCH_THRESHOLD = 0.92; // treat as the same opportunity
const SIMILARITY_AMBIGUOUS_FLOOR = Number(process.env.DEDUP_TRIGRAM_THRESHOLD ?? 0.6);

export type DedupOutcome =
  | { kind: "new"; dedupHash: string }
  | { kind: "match"; existing: Opportunity; dedupHash: string; similarity: number }
  | { kind: "needs_review"; existing: Opportunity; dedupHash: string; similarity: number };

/**
 * Stage 5: deterministic hash match, then an in-process Dice-coefficient
 * similarity scan over existing opportunities.json — the $0 substitute for
 * Postgres pg_trgm/pgvector (see ARCHITECTURE.md §5 and
 * OPTIONAL_SCALE_UP.md). No external DB or embedding API involved.
 */
export function findDuplicate(
  draft: OpportunityExtractionResult,
  existingOpportunities: Opportunity[]
): DedupOutcome {
  const dedupHash = computeDedupHash({
    organizationName: draft.organization_name ?? "",
    title: draft.title ?? "",
    location: draft.location,
  });

  const exactMatch = existingOpportunities.find((o) => o.dedup_hash === dedupHash);
  if (exactMatch) {
    return { kind: "match", existing: exactMatch, dedupHash, similarity: 1 };
  }

  const candidateText = normalize(`${draft.title ?? ""} ${draft.organization_name ?? ""}`);
  let best: { opportunity: Opportunity; similarity: number } | null = null;

  for (const opp of existingOpportunities) {
    const similarity = diceSimilarity(candidateText, opp.normalized_title);
    if (!best || similarity > best.similarity) {
      best = { opportunity: opp, similarity };
    }
  }

  if (best && best.similarity >= SIMILARITY_AUTO_MATCH_THRESHOLD) {
    return { kind: "match", existing: best.opportunity, dedupHash, similarity: best.similarity };
  }

  if (best && best.similarity >= SIMILARITY_AMBIGUOUS_FLOOR) {
    // Ambiguous band: not auto-merged. Left for manual review (or an
    // optional manual Claude tie-break using dedupTieBreakToolSchema) —
    // see ARCHITECTURE.md §5. The orchestrator records this as a new
    // opportunity flagged `needs_review` rather than risking a bad merge.
    return { kind: "needs_review", existing: best.opportunity, dedupHash, similarity: best.similarity };
  }

  return { kind: "new", dedupHash };
}
