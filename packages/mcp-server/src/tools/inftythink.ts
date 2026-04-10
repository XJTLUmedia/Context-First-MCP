import { z } from "zod";
import { runInftyThink } from "../engine/inftythink.js";

export const inftythinkInputSchema = z.object({
  problem: z.string().describe("The complex problem requiring iterative reasoning"),
  priorContext: z.string().optional().describe("Existing context or prior reasoning to build upon"),
  maxSegments: z.number().default(10).describe("Maximum number of reasoning segments (default: 10)"),
  maxSegmentTokens: z.number().default(500).describe("Maximum token budget per segment (default: 500)"),
  summaryRatio: z.number().default(0.3).describe("Target summary compression ratio 0-1 (default: 0.3)"),
});

export type InftyThinkToolInput = z.infer<typeof inftythinkInputSchema>;

export function handleInftyThink(input: InftyThinkToolInput) {
  const result = runInftyThink({
    problem: input.problem,
    priorContext: input.priorContext,
    maxSegments: input.maxSegments,
    maxSegmentTokens: input.maxSegmentTokens,
    summaryRatio: input.summaryRatio,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
