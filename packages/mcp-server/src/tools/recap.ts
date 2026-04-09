import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { refineConversation } from "../engine/refiner.js";
import type { HistoryEntry } from "../state/types.js";

export const recapInputSchema = z.object({
  sessionId: z.string().default("default"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        turn: z.number(),
      })
    )
    .describe("Recent conversation messages to analyze"),
  lookbackTurns: z.number().default(5).describe("Number of turns to analyze"),
});

export type RecapInput = z.infer<typeof recapInputSchema>;

export function handleRecap(store: SessionStore, input: RecapInput) {
  const { sessionId, messages, lookbackTurns } = input;

  // Store the messages in history
  for (const msg of messages) {
    const entry: HistoryEntry = {
      role: msg.role,
      content: msg.content,
      turn: msg.turn,
      timestamp: new Date(),
    };
    store.addHistory(sessionId, entry);
  }

  // Run the refiner
  const allHistory = store.getHistory(sessionId);
  const recap = refineConversation(allHistory, lookbackTurns);
  store.setRecap(sessionId, recap);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            summary: recap.summary,
            hiddenIntents: recap.hiddenIntents,
            keyDecisions: recap.keyDecisions,
            turn: recap.turn,
            totalHistoryLength: allHistory.length,
          },
          null,
          2
        ),
      },
    ],
  };
}
