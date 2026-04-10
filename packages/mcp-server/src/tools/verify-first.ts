import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { verifyFirst } from "../engine/verify-first.js";

export const verifyFirstInputSchema = z.object({
  sessionId: z.string().default("default"),
  candidateAnswer: z
    .string()
    .describe("The candidate answer to verify before accepting"),
  question: z
    .string()
    .describe("The original question or prompt that produced the candidate answer"),
  context: z
    .array(z.string())
    .optional()
    .describe("Optional context passages or documents to verify against"),
});

export type VerifyFirstInput = z.infer<typeof verifyFirstInputSchema>;

export function handleVerifyFirst(store: SessionStore, input: VerifyFirstInput) {
  const { sessionId, candidateAnswer, question, context } = input;
  const session = store.getOrCreate(sessionId);

  const knownFacts = Array.from(session.groundTruth.values()).map(
    (entry) => String(entry.value)
  );

  const result = verifyFirst(
    candidateAnswer,
    question,
    context,
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
