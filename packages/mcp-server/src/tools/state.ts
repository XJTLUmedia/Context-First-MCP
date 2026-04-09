import { z } from "zod";
import type { SessionStore } from "../state/store.js";

// ─── get_state ───

export const getStateInputSchema = z.object({
  sessionId: z.string().default("default"),
  keys: z
    .array(z.string())
    .optional()
    .describe("Specific state keys to retrieve. Omit for full state."),
});

export type GetStateInput = z.infer<typeof getStateInputSchema>;

export function handleGetState(store: SessionStore, input: GetStateInput) {
  const state = store.getState(input.sessionId, input.keys);

  // Serialize Map-unfriendly GroundTruthEntry values for JSON output
  const serialized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(state)) {
    serialized[key] = {
      value: entry.value,
      lockedAt: entry.lockedAt.toISOString(),
      source: entry.source,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sessionId: input.sessionId,
            entries: serialized,
            count: Object.keys(serialized).length,
          },
          null,
          2
        ),
      },
    ],
  };
}

// ─── set_state ───

export const setStateInputSchema = z.object({
  sessionId: z.string().default("default"),
  key: z.string().describe("State key to set"),
  value: z.unknown().describe("Value to store"),
  source: z
    .string()
    .default("user")
    .describe("Where this fact came from (e.g., 'user-confirmed', 'tool-output')"),
});

export type SetStateInput = z.infer<typeof setStateInputSchema>;

export function handleSetState(store: SessionStore, input: SetStateInput) {
  const entry = store.setState(
    input.sessionId,
    input.key,
    input.value,
    input.source
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sessionId: input.sessionId,
            key: input.key,
            value: entry.value,
            lockedAt: entry.lockedAt.toISOString(),
            source: entry.source,
            status: "locked",
          },
          null,
          2
        ),
      },
    ],
  };
}

// ─── clear_state ───

export const clearStateInputSchema = z.object({
  sessionId: z.string().default("default"),
  keys: z
    .array(z.string())
    .optional()
    .describe("Keys to clear. Omit to reset all state."),
});

export type ClearStateInput = z.infer<typeof clearStateInputSchema>;

export function handleClearState(store: SessionStore, input: ClearStateInput) {
  const cleared = store.clearState(input.sessionId, input.keys);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sessionId: input.sessionId,
            clearedKeys: input.keys ?? "all",
            clearedCount: cleared,
          },
          null,
          2
        ),
      },
    ],
  };
}
