import { z } from "zod";
import type { UnifiedMemoryManager } from "../memory/manager.js";

export const memoryRecallInputSchema = z.object({
  sessionId: z.string().default("default"),
  query: z.string().describe("Natural language query to recall relevant memories"),
  maxResults: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of results to return"),
  turnCount: z
    .number()
    .optional()
    .describe("Current conversation turn count (helps gate selection)"),
  recentEntropy: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Recent entropy score from entropy_monitor (0-1)"),
  hasConflicts: z
    .boolean()
    .optional()
    .describe("Whether conflicts were detected recently"),
});

export type MemoryRecallInput = z.infer<typeof memoryRecallInputSchema>;

export function handleMemoryRecall(
  manager: UnifiedMemoryManager,
  input: MemoryRecallInput
) {
  const result = manager.recall(input.sessionId, input.query, input.maxResults, {
    turnCount: input.turnCount,
    recentEntropy: input.recentEntropy,
    hasConflicts: input.hasConflicts,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sessionId: input.sessionId,
            query: input.query,
            items: result.items.map((item) => ({
              content: item.content,
              source: item.source,
              relevanceScore: Number(item.relevanceScore.toFixed(4)),
              confidence: Number(item.confidence.toFixed(4)),
              sourceEpisodeIds: item.sourceEpisodeIds,
            })),
            gateDecision: {
              interactionType: result.gateDecision.interactionType,
              fusionStrategy: result.gateDecision.fusionStrategy,
              selectedStructures: result.gateDecision.selectedStructures.map(
                (s) => ({
                  structure: s.structure,
                  weight: Number(s.weight.toFixed(4)),
                })
              ),
            },
            totalCandidates: result.totalCandidates,
            retrievalDurationMs: result.retrievalDurationMs,
          },
          null,
          2
        ),
      },
    ],
  };
}
