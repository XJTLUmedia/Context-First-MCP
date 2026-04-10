import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { iterativeSelfCritique } from "../engine/self-critique.js";

export const selfCritiqueInputSchema = z.object({
  sessionId: z.string().default("default"),
  solution: z
    .string()
    .describe("The solution or response to evaluate through iterative self-critique"),
  criteria: z
    .array(z.string())
    .optional()
    .describe("Optional criteria to evaluate against (defaults: accuracy, completeness, clarity, consistency, relevance)"),
  maxIterations: z
    .number()
    .default(3)
    .describe("Maximum number of critique-refine iterations (1-10)"),
  question: z
    .string()
    .optional()
    .describe("Optional original question for relevance evaluation"),
});

export type SelfCritiqueInput = z.infer<typeof selfCritiqueInputSchema>;

export function handleSelfCritique(store: SessionStore, input: SelfCritiqueInput) {
  const { sessionId, solution, criteria, maxIterations, question } = input;
  const session = store.getOrCreate(sessionId);

  const context = Array.from(session.groundTruth.values()).map(
    (entry) => String(entry.value)
  );

  const result = iterativeSelfCritique(
    solution,
    criteria,
    maxIterations,
    context.length > 0 ? context : undefined,
    question
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
