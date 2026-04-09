import { z } from "zod";
import { recordHealthSnapshot, detectDrift } from "../engine/drift.js";
import type { DriftResult } from "../state/types.js";

export const driftInputSchema = z.object({
  sessionId: z.string().default("default"),
  turn: z
    .number()
    .optional()
    .describe("Current turn number to record a health snapshot for"),
  health: z
    .number()
    .optional()
    .describe("Current context health score (0-1) to record"),
  breakdown: z
    .record(z.number())
    .optional()
    .describe("Per-signal health breakdown (e.g. { entropy: 0.8, ambiguity: 0.9 })"),
  windowSize: z
    .number()
    .default(5)
    .describe("Number of recent turns to include in the drift analysis window"),
});

export type DriftInput = z.infer<typeof driftInputSchema>;

export function handleDrift(input: DriftInput): DriftResult {
  const { sessionId, turn, health, breakdown, windowSize } = input;

  // If a snapshot is provided, record it before detecting drift
  if (turn !== undefined && health !== undefined) {
    recordHealthSnapshot(sessionId, turn, health, breakdown ?? {});
  }

  return detectDrift(sessionId, windowSize);
}
