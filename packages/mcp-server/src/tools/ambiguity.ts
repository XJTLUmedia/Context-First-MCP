import { z } from "zod";
import { checkAmbiguity } from "../engine/validator.js";

export const ambiguityInputSchema = z.object({
  requirement: z.string().describe("The requirement or instruction to analyze"),
  context: z.string().optional().describe("Additional context about the domain"),
});

export type AmbiguityInput = z.infer<typeof ambiguityInputSchema>;

export function handleAmbiguity(input: AmbiguityInput) {
  const result = checkAmbiguity(input.requirement, input.context);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
