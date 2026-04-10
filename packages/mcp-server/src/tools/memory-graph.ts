import { z } from "zod";
import type { UnifiedMemoryManager } from "../memory/manager.js";

export const memoryGraphInputSchema = z.object({
  sessionId: z.string().default("default"),
  action: z
    .enum(["query", "stats", "pagerank"])
    .default("stats")
    .describe("Action: query the graph, get stats, or recompute PageRank"),
  query: z
    .string()
    .optional()
    .describe("Query string for associative recall (required if action=query)"),
  maxHops: z
    .number()
    .min(1)
    .max(5)
    .default(2)
    .describe("Max graph hops for associative recall"),
  maxResults: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results to return"),
});

export type MemoryGraphInput = z.infer<typeof memoryGraphInputSchema>;

export function handleMemoryGraph(
  manager: UnifiedMemoryManager,
  input: MemoryGraphInput
) {
  switch (input.action) {
    case "query": {
      const queryText = input.query ?? "";
      const results = manager.graph.associativeRecall(
        input.sessionId,
        queryText,
        input.maxHops,
        input.maxResults
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sessionId: input.sessionId,
                action: "query",
                query: queryText,
                results: results.map((r) => ({
                  label: r.node.label,
                  type: r.node.type,
                  pageRank: Number(r.node.pageRank.toFixed(4)),
                  mentions: r.node.mentions,
                  distance: r.distance,
                  path: r.path,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "pagerank": {
      manager.graph.computePageRank(input.sessionId);
      const stats = manager.graph.getStats(input.sessionId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sessionId: input.sessionId,
                action: "pagerank_recomputed",
                ...stats,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "stats":
    default: {
      const stats = manager.graph.getStats(input.sessionId);
      const edges = manager.graph.getEdges(input.sessionId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sessionId: input.sessionId,
                action: "stats",
                ...stats,
                sampleEdges: edges.slice(0, 20).map((e) => ({
                  source: e.source,
                  target: e.target,
                  relation: e.relation,
                  weight: e.weight,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
}
