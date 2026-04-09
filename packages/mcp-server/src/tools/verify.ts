import { z } from "zod";
import { verifyExecution } from "../engine/validator.js";

export const verifyInputSchema = z.object({
  goal: z.string().describe("What was supposed to happen"),
  output: z.string().describe("What actually happened (tool output/response)"),
  expectedIndicators: z
    .array(z.string())
    .optional()
    .describe("Specific strings/patterns that indicate success"),
});

export type VerifyInput = z.infer<typeof verifyInputSchema>;

export function handleVerify(input: VerifyInput) {
  const result = verifyExecution(
    input.goal,
    input.output,
    input.expectedIndicators
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
