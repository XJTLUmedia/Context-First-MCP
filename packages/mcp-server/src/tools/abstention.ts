import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { checkAbstention } from "../engine/abstention.js";

export const abstentionInputSchema = z.object({
  sessionId: z.string().default("default"),
  claim: z.string().describe("The claim or assertion to evaluate confidence for"),
  requiredKeys: z
    .array(z.string())
    .describe("State keys required to confidently answer this claim"),
  threshold: z
    .number()
    .default(0.6)
    .describe("Confidence threshold below which abstention is recommended (0-1)"),
});

export type AbstentionInput = z.infer<typeof abstentionInputSchema>;

export function handleAbstention(store: SessionStore, input: AbstentionInput) {
  const { sessionId, claim, requiredKeys, threshold } = input;
  const session = store.getOrCreate(sessionId);

  const result = checkAbstention(
    claim,
    session.groundTruth,
    requiredKeys,
    session.conflicts,
    session.history,
    threshold
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
