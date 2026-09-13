import { randomUUID } from "crypto";
import { getActiveSources } from "../sources/registry";
import { getOpportunities, getProfiles, touchSourceLastChecked, appendRun, updateRun } from "../store/jsonStore";
import { discoverFromSource } from "./discover";
import { extractPendingItems } from "./extract";
import { filterValidExtractions } from "./validate";
import { findDuplicate } from "./deduplicate";
import { scoreForAllProfiles } from "./analyze";
import { persistNewOpportunity, persistOpportunityUpdate, resolveOrganization } from "./persist";
import type { Opportunity, SearchRunRecord } from "../types";

export interface PipelineRunSummary {
  runId: string;
  sourcesProcessed: number;
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsNeedsReview: number;
  itemsRejected: number;
  errors: string[];
}

/**
 * Runs the full SOURCE -> ... -> DATA FILE pipeline for every active
 * source, entirely deterministically (no LLM call) — see ARCHITECTURE.md
 * §4. Intended to be invoked once per GitHub Actions schedule tick via
 * scripts/run-pipeline.ts; the caller is responsible for committing the
 * resulting data/*.json changes.
 */
export async function runPipeline(runType: "scheduled" | "manual" = "manual"): Promise<PipelineRunSummary> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  await appendRun({
    id: runId,
    run_type: runType,
    started_at: startedAt,
    completed_at: null,
    items_found: 0,
    items_new: 0,
    items_updated: 0,
    items_duplicate: 0,
    items_needs_review: 0,
    status: "running",
    error_log: null,
  } satisfies SearchRunRecord);

  const summary: PipelineRunSummary = {
    runId,
    sourcesProcessed: 0,
    itemsFound: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    itemsNeedsReview: 0,
    itemsRejected: 0,
    errors: [],
  };

  try {
    const sources = await getActiveSources();
    const profiles = await getProfiles();

    for (const source of sources) {
      // Re-read opportunities fresh each source iteration so dedup checks
      // and the content-hash gate see writes from earlier sources in this
      // same run.
      const currentOpportunities: Opportunity[] = await getOpportunities();

      const discoverResult = await discoverFromSource(source, currentOpportunities);
      summary.sourcesProcessed++;
      summary.itemsFound += discoverResult.itemsFound;
      if (discoverResult.error) summary.errors.push(discoverResult.error);
      await touchSourceLastChecked(source.id);

      const extracted = extractPendingItems(source, discoverResult.pending);
      const { valid, rejected } = filterValidExtractions(extracted);
      summary.itemsRejected += rejected.length;

      for (const item of valid) {
        const freshOpportunities = await getOpportunities();
        const dedupOutcome = findDuplicate(item.extraction, freshOpportunities);
        const organization = await resolveOrganization(item.extraction.organization_name ?? "Unknown");

        if (dedupOutcome.kind === "match") {
          const scores = scoreForAllProfiles(item.extraction, organization, profiles);
          await persistOpportunityUpdate({
            existing: dedupOutcome.existing,
            extraction: item.extraction,
            contentHash: item.contentHash,
            sourceId: item.sourceRegistryId,
            sourceUrl: item.sourceUrl,
            scores,
          });
          summary.itemsUpdated++;
        } else if (dedupOutcome.kind === "needs_review") {
          const scores = scoreForAllProfiles(item.extraction, organization, profiles);
          await persistNewOpportunity({
            extraction: item.extraction,
            dedupHash: dedupOutcome.dedupHash,
            contentHash: item.contentHash,
            organizationId: organization.id,
            sourceId: item.sourceRegistryId,
            sourceUrl: item.sourceUrl,
            scores,
            needsReview: true,
          });
          summary.itemsNeedsReview++;
        } else {
          const scores = scoreForAllProfiles(item.extraction, organization, profiles);
          await persistNewOpportunity({
            extraction: item.extraction,
            dedupHash: dedupOutcome.dedupHash,
            contentHash: item.contentHash,
            organizationId: organization.id,
            sourceId: item.sourceRegistryId,
            sourceUrl: item.sourceUrl,
            scores,
          });
          summary.itemsNew++;
        }
      }
    }

    await updateRun(runId, {
      completed_at: new Date().toISOString(),
      items_found: summary.itemsFound,
      items_new: summary.itemsNew,
      items_updated: summary.itemsUpdated,
      items_needs_review: summary.itemsNeedsReview,
      status: summary.errors.length > 0 ? "partial" : "success",
      error_log: summary.errors.length > 0 ? summary.errors.join("\n") : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    summary.errors.push(message);
    await updateRun(runId, { completed_at: new Date().toISOString(), status: "failed", error_log: message });
  }

  return summary;
}
