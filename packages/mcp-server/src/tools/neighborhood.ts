import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { checkNeighborhoodConsistency } from "../engine/neighborhood.js";

export const neighborhoodInputSchema = z.object({
  sessionId: z.string().default("default"),
  originalQuery: z
    .string()
    .describe("The original question or prompt to test neighborhood consistency for"),
  response: z
    .string()
    .describe("The response to evaluate for neighborhood consistency"),
});

export type NeighborhoodInput = z.infer<typeof neighborhoodInputSchema>;

export function handleNeighborhood(store: SessionStore, input: NeighborhoodInput) {
  const { sessionId, originalQuery, response } = input;
  const session = store.getOrCreate(sessionId);

  const knownFacts = Array.from(session.groundTruth.values()).map(
    (entry) => `${entry.value} (source: ${entry.source})`
  );

  const result = checkNeighborhoodConsistency(
    originalQuery,
    response,
    knownFacts
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
