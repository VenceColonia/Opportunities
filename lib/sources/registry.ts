import type { SourceRegistryEntry } from "../types";
import type { SourceAdapter } from "./types";
import { rssAdapter } from "./rss-adapter";
import { getActiveSources as getActiveSourcesFromStore } from "../store/jsonStore";

// Add new adapters here as they're built. Order matters only in that the
// first adapter whose supports() returns true wins.
const ADAPTERS: SourceAdapter[] = [rssAdapter];

export function getAdapterForSource(source: SourceRegistryEntry): SourceAdapter | null {
  return ADAPTERS.find((adapter) => adapter.supports(source)) ?? null;
}

export async function getActiveSources(): Promise<SourceRegistryEntry[]> {
  return getActiveSourcesFromStore();
}
