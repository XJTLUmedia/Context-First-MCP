import { z } from "zod";
import { runKAGThinker } from "../engine/kagthinker.js";

export const kagthinkerInputSchema = z.object({
  problem: z.string().describe("The complex problem to decompose and solve with structured logical forms"),
  knownFacts: z.array(z.string()).default([]).describe("Known facts or context to ground reasoning against"),
  maxDepth: z.number().default(4).describe("Maximum depth for problem decomposition (default: 4)"),
  maxSteps: z.number().default(20).describe("Maximum interactive reasoning steps (default: 20)"),
});

export type KAGThinkerToolInput = z.infer<typeof kagthinkerInputSchema>;

export function handleKAGThinker(input: KAGThinkerToolInput) {
  const result = runKAGThinker({
    problem: input.problem,
    knownFacts: input.knownFacts,
    maxDepth: input.maxDepth,
    maxSteps: input.maxSteps,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          logicalForms: result.logicalForms,
          finalAnswer: result.finalAnswer,
          totalSubProblems: result.totalSubProblems,
          resolvedCount: result.resolvedCount,
          failedCount: result.failedCount,
          maxDepth: result.maxDepth,
          fullyResolved: result.fullyResolved,
          interactiveSteps: result.interactiveSteps,
          stabilityScore: result.stabilityScore,
          dependencyGraph: result.dependencyGraph,
        }, null, 2),
      },
    ],
  };
}
