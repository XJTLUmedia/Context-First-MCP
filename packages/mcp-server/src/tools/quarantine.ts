import { z } from "zod";
import type { SiloManager } from "../state/silo.js";

// ─── quarantine_context ───

export const quarantineInputSchema = z.object({
  sessionId: z.string().default("default"),
  name: z.string().describe("Name for the quarantine silo"),
  inheritKeys: z
    .array(z.string())
    .optional()
    .describe("State keys to inherit from parent session"),
  ttl: z
    .number()
    .default(300000)
    .describe("Time-to-live in milliseconds (default: 5 minutes)"),
});

export type QuarantineInput = z.infer<typeof quarantineInputSchema>;

export function handleQuarantine(siloManager: SiloManager, input: QuarantineInput) {
  const silo = siloManager.createSilo(
    input.sessionId,
    input.name,
    input.inheritKeys,
    input.ttl
  );

  // Serialize silo state for JSON output
  const stateEntries: Record<string, unknown> = {};
  for (const [key, entry] of silo.state) {
    stateEntries[key] = {
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
            siloId: silo.siloId,
            name: silo.name,
            parentSessionId: silo.parentSessionId,
            status: silo.status,
            inheritedKeys: Object.keys(stateEntries),
            inheritedState: stateEntries,
            ttl: silo.ttl,
            createdAt: silo.createdAt.toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}

// ─── merge_quarantine ───

export const mergeQuarantineInputSchema = z.object({
  siloId: z.string().describe("ID of the quarantine silo to merge or discard"),
  action: z
    .enum(["merge", "discard"])
    .describe("Whether to merge silo state back to parent or discard it"),
  promoteKeys: z
    .array(z.string())
    .optional()
    .describe("Keys to promote to parent session (merge only). Omit to promote all."),
});

export type MergeQuarantineInput = z.infer<typeof mergeQuarantineInputSchema>;

export function handleMergeQuarantine(
  siloManager: SiloManager,
  input: MergeQuarantineInput
) {
  if (input.action === "merge") {
    const result = siloManager.mergeSilo(input.siloId, input.promoteKeys);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              action: "merged",
              siloId: input.siloId,
              merged: result.merged,
              promotedCount: result.promotedCount,
              promotedKeys: result.promotedKeys,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const result = siloManager.discardSilo(input.siloId);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            action: "discarded",
            siloId: input.siloId,
            discarded: result.discarded,
          },
          null,
          2
        ),
      },
    ],
  };
}
