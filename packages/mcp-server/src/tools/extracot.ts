import { z } from "zod";
import { runExtraCoT } from "../engine/extracot.js";

export const extracotInputSchema = z.object({
  problem: z.string().describe("The original problem for context-aware compression"),
  reasoningSteps: z.array(z.string()).describe("Array of reasoning steps to compress"),
  maxBudget: z.number().default(200).describe("Maximum token budget for the compressed chain (default: 200)"),
  targetCompression: z.number().default(0.4).describe("Target compression ratio 0-1, lower = more compression (default: 0.4)"),
});

export type ExtraCoTToolInput = z.infer<typeof extracotInputSchema>;

export function handleExtraCoT(input: ExtraCoTToolInput) {
  const result = runExtraCoT({
    problem: input.problem,
    reasoningSteps: input.reasoningSteps,
    maxBudget: input.maxBudget,
    targetCompression: input.targetCompression,
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
