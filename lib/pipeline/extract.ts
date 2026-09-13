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

const TITLE_ORG_SEPARATORS = [" at ", " - ", " – ", " | "];

/**
 * Best-effort split of an RSS item title like "Summer Analyst at Acme Corp"
 * into (title, organization). Falls back to the source's own name (many
 * career-page RSS feeds are single-employer) with lower confidence rather
 * than fabricating an organization.
 */
function splitTitleAndOrganization(rawTitle: string, sourceName: string): { title: string; organization: string; confident: boolean } {
  for (const separator of TITLE_ORG_SEPARATORS) {
    const idx = rawTitle.lastIndexOf(separator);
    if (idx > 0) {
      return {
        title: rawTitle.slice(0, idx).trim(),
        organization: rawTitle.slice(idx + separator.length).trim(),
        confident: true,
      };
    }
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
