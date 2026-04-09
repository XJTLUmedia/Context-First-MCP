import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { summarizeHistory } from "../engine/validator.js";

export const historyInputSchema = z.object({
  sessionId: z.string().default("default"),
  maxTokens: z
    .number()
    .default(500)
    .describe("Target length for the summary in approximate tokens"),
});

export type HistoryInput = z.infer<typeof historyInputSchema>;

export function handleHistory(store: SessionStore, input: HistoryInput) {
  const history = store.getHistory(input.sessionId);
  const result = summarizeHistory(history, input.maxTokens);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
