import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { ioeSelfCorrect } from "../engine/ioe-correct.js";

export const ioeSelfCorrectInputSchema = z.object({
  sessionId: z.string().default("default"),
  response: z
    .string()
    .describe("The response to evaluate for self-correction"),
  question: z
    .string()
    .optional()
    .describe("Optional original question to check relevance"),
  priorAttempts: z
    .array(z.string())
    .optional()
    .describe("Optional list of prior correction attempts for escalation detection"),
});

export type IoeSelfCorrectInput = z.infer<typeof ioeSelfCorrectInputSchema>;

export function handleIoeSelfCorrect(store: SessionStore, input: IoeSelfCorrectInput) {
  const { sessionId, response, question, priorAttempts } = input;
  const session = store.getOrCreate(sessionId);

  const result = ioeSelfCorrect(
    response,
    session.groundTruth,
    question,
    priorAttempts
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
