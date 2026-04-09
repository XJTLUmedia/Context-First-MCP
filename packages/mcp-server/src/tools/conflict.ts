import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { detectConflicts } from "../engine/detector.js";

export const conflictInputSchema = z.object({
  sessionId: z.string().default("default"),
  newMessage: z.string().describe("The new user message to check against ground truth"),
});

export type ConflictInput = z.infer<typeof conflictInputSchema>;

export function handleConflict(store: SessionStore, input: ConflictInput) {
  const { sessionId, newMessage } = input;
  const session = store.getOrCreate(sessionId);
  const result = detectConflicts(newMessage, session.groundTruth);

  // Record any detected conflicts
  for (const conflict of result.conflicts) {
    store.addConflict(sessionId, {
      key: conflict.existingKey,
      oldValue: conflict.existingValue,
      newValue: conflict.conflictingStatement,
      description: conflict.suggestion,
      detectedAt: new Date(),
    });
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
