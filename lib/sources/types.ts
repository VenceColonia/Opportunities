import type { SourceRegistryEntry } from "../types";

export interface DiscoveredItem {
  sourceUrl: string;
  title: string;
  rawContent: string;
}

/**
 * A source adapter turns one source_registry entry into a list of raw
 * discovered items. It does NOT parse/extract structured fields — that is
 * Claude's job (lib/claude/client.ts::extractOpportunity). An adapter's only
 * responsibility is "fetch the right pages/feed, hand back raw text plus
 * where it came from."
 */
export interface SourceAdapter {
  supports(source: SourceRegistryEntry): boolean;
  discover(source: SourceRegistryEntry): Promise<DiscoveredItem[]>;
}
