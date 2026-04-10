import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { probeInternalState } from "../engine/internal-state.js";

export const internalStateInputSchema = z.object({
  sessionId: z.string().default("default"),
  assistantOutput: z
    .string()
    .describe("The assistant output to probe for internal state signals"),
  includeHistory: z
    .boolean()
    .default(true)
    .describe("Whether to include conversation history for self-consistency analysis"),
});

export type InternalStateInput = z.infer<typeof internalStateInputSchema>;

export function handleInternalState(store: SessionStore, input: InternalStateInput) {
  const { sessionId, assistantOutput, includeHistory } = input;
  const session = store.getOrCreate(sessionId);

  const result = probeInternalState(
    assistantOutput,
    session.groundTruth,
    includeHistory
      ? session.history
          .filter((h) => h.role === "assistant")
          .map((h) => h.content)
      : undefined
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
