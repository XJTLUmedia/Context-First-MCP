import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { checkGrounding } from "../engine/grounding.js";
import type { GroundingResult } from "../state/types.js";

export const groundingInputSchema = z.object({
  sessionId: z.string().default("default"),
  assistantOutput: z
    .string()
    .describe("The assistant's most recent output to check for grounding"),
  claim: z
    .string()
    .optional()
    .describe("Optional specific claim to verify against ground truth"),
});

export type GroundingInput = z.infer<typeof groundingInputSchema>;

export function handleGrounding(
  store: SessionStore,
  input: GroundingInput
): GroundingResult {
  const { sessionId, assistantOutput, claim } = input;
  const session = store.getOrCreate(sessionId);

  return checkGrounding(assistantOutput, session.groundTruth, claim);
}
