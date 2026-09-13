import type { Opportunity, SourceRegistryEntry } from "../types";
import type { DiscoveredItem } from "../sources/types";
import { getAdapterForSource } from "../sources/registry";
import { computeContentHash } from "../dedup";

export interface PendingItem {
  item: DiscoveredItem;
  contentHash: string;
}

export interface DiscoverResult {
  sourceId: string;
  itemsFound: number;
  pending: PendingItem[]; // new or changed content that should proceed to extraction
  itemsUnchanged: number; // hash matched an existing opportunity's last-seen content -> skipped
  error?: string;
}

/**
 * Stage 1-2: fetch raw items from one source, then apply the content-hash
 * gate against what's already in opportunities.json for that exact source
 * URL — this is the cost/effort-control point (ARCHITECTURE.md §4): nothing
 * unchanged proceeds to extraction.
 */
export async function discoverFromSource(
  source: SourceRegistryEntry,
  existingOpportunities: Opportunity[]
): Promise<DiscoverResult> {
  const adapter = getAdapterForSource(source);
  if (!adapter) {
    return {
      sourceId: source.id,
      itemsFound: 0,
      pending: [],
      itemsUnchanged: 0,
      error: `No adapter supports search_method '${source.search_method}' for source '${source.name}'.`,
    };
  }

  let items: DiscoveredItem[];
  try {
    items = await adapter.discover(source);
  } catch (err) {
    return {
      sourceId: source.id,
      itemsFound: 0,
      pending: [],
      itemsUnchanged: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const previousHashBySourceUrl = new Map<string, string>();
  for (const opp of existingOpportunities) {
    for (const ref of opp.sources) {
      if (ref.source_url) previousHashBySourceUrl.set(ref.source_url, opp.raw_content_hash);
    }
  }

  const pending: PendingItem[] = [];
  let unchanged = 0;

  for (const item of items) {
    const contentHash = computeContentHash(item.rawContent);
    if (previousHashBySourceUrl.get(item.sourceUrl) === contentHash) {
      unchanged++;
      continue;
    }
    pending.push({ item, contentHash });
  }

  return { sourceId: source.id, itemsFound: items.length, pending, itemsUnchanged: unchanged };
}
