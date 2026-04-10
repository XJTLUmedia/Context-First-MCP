import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { checkLogicalConsistency } from "../engine/logical-consistency.js";

export const logicalConsistencyInputSchema = z.object({
  sessionId: z.string().default("default"),
  claims: z
    .array(z.string())
    .describe("List of claims or assertions to check for logical consistency"),
  includeGroundTruth: z
    .boolean()
    .default(true)
    .describe("Whether to check claims against stored ground truth facts"),
});

export type LogicalConsistencyInput = z.infer<typeof logicalConsistencyInputSchema>;

export function handleLogicalConsistency(
  store: SessionStore,
  input: LogicalConsistencyInput
) {
  const { sessionId, claims, includeGroundTruth } = input;
  const session = store.getOrCreate(sessionId);

  const knownFacts = includeGroundTruth
    ? Array.from(session.groundTruth.values()).map((entry) => String(entry.value))
    : undefined;

  const result = checkLogicalConsistency(claims, knownFacts);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
