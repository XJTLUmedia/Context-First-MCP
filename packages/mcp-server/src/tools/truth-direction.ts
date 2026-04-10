import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { analyzeTruthDirection } from "../engine/truth-direction.js";

export const truthDirectionInputSchema = z.object({
  sessionId: z.string().default("default"),
  assistantOutput: z
    .string()
    .describe("The assistant output to analyze for truth direction consistency"),
  includePriorOutputs: z
    .boolean()
    .default(true)
    .describe("Whether to include prior assistant outputs for cross-response analysis"),
});

export type TruthDirectionInput = z.infer<typeof truthDirectionInputSchema>;

export function handleTruthDirection(store: SessionStore, input: TruthDirectionInput) {
  const { sessionId, assistantOutput, includePriorOutputs } = input;
  const session = store.getOrCreate(sessionId);

  const priorOutputs = includePriorOutputs
    ? session.history
        .filter((h) => h.role === "assistant")
        .map((h) => h.content)
    : undefined;

  const result = analyzeTruthDirection(
    assistantOutput,
    session.groundTruth,
    priorOutputs
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
