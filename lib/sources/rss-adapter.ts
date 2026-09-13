import Parser from "rss-parser";
import type { SourceRegistryEntry } from "../types";
import type { SourceAdapter, DiscoveredItem } from "./types";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "OpportunityDashboardBot/0.1 (+student opportunity discovery)" },
});

/**
 * The MVP's only "live" adapter. Sources whose search_method is 'rss' are
 * fetched via a standard feed parser — no scraping, no headless browser,
 * nothing that risks violating a site's terms. Sources needing anything
 * heavier (search_method 'scrape_permitted', JS-rendered pages) get a
 * dedicated adapter later (see ARCHITECTURE.md §1) rather than bolting that
 * onto this one.
 */
export const rssAdapter: SourceAdapter = {
  supports(source: SourceRegistryEntry) {
    return source.search_method === "rss";
  },

  async discover(source: SourceRegistryEntry): Promise<DiscoveredItem[]> {
    const feed = await parser.parseURL(source.url);

    return (feed.items ?? [])
      .filter((item) => item.link)
      .map((item) => {
        const rawContent = [item.title, item.contentSnippet ?? item.content, item.isoDate ?? item.pubDate]
          .filter(Boolean)
          .join("\n\n");

        return {
          sourceUrl: item.link as string,
          title: item.title ?? "",
          rawContent,
        };
      });
  },
};
