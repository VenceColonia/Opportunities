import type { SourceRegistryEntry } from "../types";
import type { SourceAdapter, DiscoveredItem } from "./types";

interface GreenhouseJob {
  title: string;
  absolute_url: string;
  content?: string;
  location?: { name?: string };
  departments?: { name: string }[];
  offices?: { name: string }[];
}

interface GreenhouseBoardResponse {
  jobs: GreenhouseJob[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Greenhouse's Job Board API (boards-api.greenhouse.io/v1/boards/<token>/jobs)
 * is public and unauthenticated — a real, free, ToS-respecting alternative to
 * scraping a platform like LinkedIn or JobStreet, which offer no such thing
 * (see ARCHITECTURE.md §1: no scraping of sites that don't offer a feed/API).
 * A source using this adapter has its `url` pointed at that endpoint for a
 * specific company's board token, e.g.
 * "https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true".
 */
export const greenhouseAdapter: SourceAdapter = {
  supports(source: SourceRegistryEntry) {
    return source.search_method === "api" && source.url.includes("greenhouse.io");
  },

  async discover(source: SourceRegistryEntry): Promise<DiscoveredItem[]> {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "OpportunityDashboardBot/0.1 (+student opportunity discovery)" },
    });
    if (!response.ok) {
      throw new Error(`Status code ${response.status}`);
    }

    const data = (await response.json()) as GreenhouseBoardResponse;

    return (data.jobs ?? []).map((job) => {
      const location = job.location?.name ?? job.offices?.map((o) => o.name).join(", ") ?? "";
      const departments = job.departments?.map((d) => d.name).join(", ") ?? "";
      const description = job.content ? stripHtml(job.content) : "";

      const rawContent = [location ? `Location: ${location}` : "", departments ? `Department: ${departments}` : "", description]
        .filter(Boolean)
        .join("\n\n");

      return {
        sourceUrl: job.absolute_url,
        title: job.title,
        rawContent,
      };
    });
  },
};
