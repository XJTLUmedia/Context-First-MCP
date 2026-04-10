import { z } from "zod";
import { runCoconut } from "../engine/coconut.js";

export const coconutInputSchema = z.object({
  problem: z.string().describe("The problem to reason about using continuous thought"),
  maxSteps: z.number().default(8).describe("Maximum number of latent reasoning steps (default: 8)"),
  breadth: z.number().default(3).describe("Number of parallel reasoning paths per step (default: 3)"),
  enableBreadthExploration: z.boolean().default(true).describe("Enable BFS-like breadth exploration (default: true)"),
});

export type CoconutToolInput = z.infer<typeof coconutInputSchema>;

export function handleCoconut(input: CoconutToolInput) {
  const result = runCoconut({
    problem: input.problem,
    maxSteps: input.maxSteps,
    breadth: input.breadth,
    enableBreadthExploration: input.enableBreadthExploration,
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
