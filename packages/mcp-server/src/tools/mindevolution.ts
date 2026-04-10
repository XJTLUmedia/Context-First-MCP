import { z } from "zod";
import { runMindEvolution } from "../engine/mindevolution.js";

export const mindevolutionInputSchema = z.object({
  problem: z.string().describe("The problem to solve using evolutionary search over candidate solutions"),
  criteria: z.array(z.string()).optional().describe("Evaluation criteria for fitness scoring"),
  populationSize: z.number().default(8).describe("Number of candidate solutions per generation (default: 8)"),
  maxGenerations: z.number().default(5).describe("Maximum number of evolutionary generations (default: 5)"),
  selectionRatio: z.number().default(0.5).describe("Fraction of population that survives selection (default: 0.5)"),
  seedResponses: z.array(z.string()).min(1).describe("Seed responses from the LLM to evolve. At least 1 required — the LLM generates candidates, this tool evolves them."),
});

export type MindEvolutionToolInput = z.infer<typeof mindevolutionInputSchema>;

export function handleMindEvolution(input: MindEvolutionToolInput) {
  const result = runMindEvolution({
    problem: input.problem,
    criteria: input.criteria,
    populationSize: input.populationSize,
    maxGenerations: input.maxGenerations,
    selectionRatio: input.selectionRatio,
    seedResponses: input.seedResponses,
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
