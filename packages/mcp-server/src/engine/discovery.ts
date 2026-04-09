import type { ToolCatalog } from "../registry/catalog.js";
import type { DiscoveryResult } from "../state/types.js";

/**
 * Semantic routing engine for tool discovery (MCP-Zero pattern).
 * Two-stage routing: tag-based pre-filter + TF-IDF fine-grained ranking.
 */
export function discoverTools(
  catalog: ToolCatalog,
  query: string,
  maxResults: number = 5,
  minScore: number = 0.01
): DiscoveryResult {
  const allEntries = catalog.getAll();
  const totalCandidates = allEntries.length;

  if (totalCandidates === 0) {
    return {
      matches: [],
      totalCandidates: 0,
      query,
    };
  }

  // Stage 1: Tag-based pre-filter
  const queryLower = query.toLowerCase();
  const queryTokens = queryLower
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

  // Check if any query tokens match tags — boost those entries
  const tagBoosts = new Map<string, number>();
  for (const entry of allEntries) {
    let boost = 0;
    for (const tag of entry.tags) {
      const tagLower = tag.toLowerCase();
      for (const token of queryTokens) {
        if (tagLower.includes(token) || token.includes(tagLower)) {
          boost += 0.15;
        }
      }
    }
    if (boost > 0) {
      tagBoosts.set(entry.name, Math.min(boost, 0.5));
    }
  }

  // Stage 2: TF-IDF search via catalog
  const searchResults = catalog.search(query, maxResults * 2, 0);

  // Combine scores with tag boosts
  const combined = searchResults.map((r) => {
    const tagBoost = tagBoosts.get(r.entry.name) || 0;
    return {
      ...r,
      score: Math.min(1, r.score + tagBoost),
    };
  });

  // Also add any tag-matched entries not in TF-IDF results
  const resultNames = new Set(combined.map((r) => r.entry.name));
  for (const [name, boost] of tagBoosts) {
    if (!resultNames.has(name)) {
      const entry = allEntries.find((e) => e.name === name);
      if (entry) {
        combined.push({ entry, score: boost });
      }
    }
  }

  // Sort by score descending and apply filters
  combined.sort((a, b) => b.score - a.score);

  const filtered = combined
    .filter((r) => r.score >= minScore)
    .slice(0, maxResults);

  return {
    matches: filtered.map((r) => ({
      toolName: r.entry.name,
      description: r.entry.description,
      relevanceScore: Math.round(r.score * 10000) / 10000,
      tags: r.entry.tags,
      inputSchema: r.entry.inputSchema,
    })),
    totalCandidates,
    query,
  };
}
