import Anthropic from "@anthropic-ai/sdk";
import type { StudentProfile } from "../types";
import {
  extractionToolSchema,
  scoringToolSchema,
  dedupTieBreakToolSchema,
  searchFilterToolSchema,
  type OpportunityExtractionResult,
  type OpportunityScoringResult,
  type DedupTieBreakResult,
  type SearchFilterResult,
} from "./schemas";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  SCORING_SYSTEM_PROMPT,
  buildScoringUserPrompt,
  DEDUP_TIE_BREAK_SYSTEM_PROMPT,
  buildDedupTieBreakUserPrompt,
  SEARCH_PARSE_SYSTEM_PROMPT,
  buildSearchParseUserPrompt,
} from "./prompts";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var.");
  client = new Anthropic({ apiKey });
  return client;
}

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

/**
 * Forces a single tool call and returns its parsed input. This is how every
 * Claude call in the pipeline gets structured JSON instead of parsed prose —
 * see ARCHITECTURE.md §2 and §6.
 */
async function callForcedTool<T>(params: {
  system: string | Anthropic.Messages.TextBlockParam[];
  userContent: string;
  tool: Anthropic.Messages.Tool;
  maxTokens?: number;
}): Promise<T> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: params.maxTokens ?? 1024,
    system: params.system,
    tools: [params.tool],
    tool_choice: { type: "tool", name: params.tool.name },
    messages: [{ role: "user", content: params.userContent }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new Error(`Claude did not return a ${params.tool.name} tool call.`);
  }

  return toolUse.input as T;
}

export async function extractOpportunity(params: {
  sourceUrl: string;
  sourceName: string;
  rawContent: string;
}): Promise<OpportunityExtractionResult> {
  return callForcedTool<OpportunityExtractionResult>({
    system: EXTRACTION_SYSTEM_PROMPT,
    userContent: buildExtractionUserPrompt(params),
    tool: extractionToolSchema as unknown as Anthropic.Messages.Tool,
    maxTokens: 1500,
  });
}

export async function scoreOpportunityForProfile(params: {
  opportunity: OpportunityExtractionResult;
  organizationName: string;
  profile: StudentProfile;
  daysUntilDeadline: number | null;
}): Promise<OpportunityScoringResult> {
  // The rubric (system prompt) is identical across every scoring call and
  // is the largest static chunk of tokens in this request — mark it
  // cacheable so repeat calls within the cache TTL only pay full input
  // price once. This only matters if you're running many calls in a short
  // window (e.g. scripts/enrich-with-claude.ts, OPTIONAL_SCALE_UP.md's
  // automated path) — the SDK's stable types don't yet expose
  // cache_control, so it's added via a typed extension rather than `any`.
  type CacheableTextBlock = Anthropic.Messages.TextBlockParam & {
    cache_control?: { type: "ephemeral" };
  };
  const cachedSystem: CacheableTextBlock[] = [
    {
      type: "text",
      text: SCORING_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  return callForcedTool<OpportunityScoringResult>({
    system: cachedSystem,
    userContent: buildScoringUserPrompt(params),
    tool: scoringToolSchema as unknown as Anthropic.Messages.Tool,
    maxTokens: 700,
  });
}

export async function resolveDedupTieBreak(params: {
  a: { title: string; organization: string; location?: string | null; deadline?: string | null };
  b: { title: string; organization: string; location?: string | null; deadline?: string | null };
}): Promise<DedupTieBreakResult> {
  return callForcedTool<DedupTieBreakResult>({
    system: DEDUP_TIE_BREAK_SYSTEM_PROMPT,
    userContent: buildDedupTieBreakUserPrompt(params),
    tool: dedupTieBreakToolSchema as unknown as Anthropic.Messages.Tool,
    maxTokens: 300,
  });
}

export async function parseSearchQuery(query: string): Promise<SearchFilterResult> {
  return callForcedTool<SearchFilterResult>({
    system: SEARCH_PARSE_SYSTEM_PROMPT,
    userContent: buildSearchParseUserPrompt(query),
    tool: searchFilterToolSchema as unknown as Anthropic.Messages.Tool,
    maxTokens: 400,
  });
}
