import type { SourceRegistryEntry } from "../types";
import type { OpportunityExtractionResult } from "../claude/schemas";
import { extractHeuristically } from "../scoring/heuristics";
import type { PendingItem } from "./discover";

export interface ExtractedItem {
  sourceRegistryId: string;
  sourceUrl: string;
  contentHash: string;
  extraction: OpportunityExtractionResult;
}

/**
 * Best-effort split of an RSS item title into (title, organization).
 *
 * Different feeds use different conventions, and guessing wrong is worse
 * than admitting uncertainty (a real-data pipeline run surfaced this: a
 * naive "split on the last dash" rule was misreading We Work Remotely
 * titles like "Account Executive - DACH" and producing garbage
 * organizations such as "DACH" or "Northeast" — a region qualifier inside
 * the title, not a company). So this only trusts patterns that are
 * actually documented/observed conventions for a specific format, tried
 * most-specific first, and falls back to the source's own name (many
 * career-page feeds are single-employer anyway) rather than guessing from
 * generic punctuation.
 */
function splitTitleAndOrganization(rawTitle: string, sourceName: string): { title: string; organization: string; confident: boolean } {
  // We Work Remotely's documented format: "Company Name: Job Title".
  const colonIdx = rawTitle.indexOf(": ");
  if (colonIdx > 0) {
    return {
      title: rawTitle.slice(colonIdx + 2).trim(),
      organization: rawTitle.slice(0, colonIdx).trim(),
      confident: true,
    };
  }

  // A common convention elsewhere: "Job Title at Company Name".
  const atIdx = rawTitle.lastIndexOf(" at ");
  if (atIdx > 0) {
    return {
      title: rawTitle.slice(0, atIdx).trim(),
      organization: rawTitle.slice(atIdx + 4).trim(),
      confident: true,
    };
  }

  return { title: rawTitle.trim(), organization: sourceName, confident: false };
}

/**
 * Stage 3 (deterministic default): heuristic extraction, no LLM call. See
 * ARCHITECTURE.md §7 and §1 for why the automated path never calls Claude,
 * and OPTIONAL_SCALE_UP.md for how to swap this for
 * lib/claude/client.ts::extractOpportunity if you opt into the paid path.
 */
export function extractPendingItems(source: SourceRegistryEntry, pending: PendingItem[]): ExtractedItem[] {
  return pending.map(({ item, contentHash }) => {
    const { title, organization, confident } = splitTitleAndOrganization(item.title, source.name);
    const extraction = extractHeuristically({ title, rawContent: item.rawContent });

    extraction.organization_name = organization;
    extraction.application_url = item.sourceUrl;
    if (!confident) {
      extraction.extraction_confidence.organization_name = 0.4;
      extraction.unresolved_fields.push("organization_name");
    } else {
      extraction.extraction_confidence.organization_name = 0.7;
    }

    return {
      sourceRegistryId: source.id,
      sourceUrl: item.sourceUrl,
      contentHash,
      extraction,
    };
  });
}
