import { z } from "zod";
import type { UnifiedMemoryManager } from "../memory/manager.js";

export const memoryInspectInputSchema = z.object({
  sessionId: z.string().default("default"),
  tier: z
    .enum(["all", "scratchpad", "working", "episodic", "semantic", "graph", "curation", "callbacks"])
    .default("all")
    .describe("Which memory tier to inspect"),
  verifyIntegrity: z
    .boolean()
    .default(false)
    .describe("Run integrity verification across all tiers"),
});

export type MemoryInspectInput = z.infer<typeof memoryInspectInputSchema>;

export function handleMemoryInspect(
  manager: UnifiedMemoryManager,
  input: MemoryInspectInput
) {
  const result: Record<string, unknown> = {
    sessionId: input.sessionId,
  };

  if (input.tier === "all") {
    result.status = manager.getStatus(input.sessionId);
  } else {
    switch (input.tier) {
      case "scratchpad":
        result.scratchpad = {
          entries: manager.scratchpad.get(input.sessionId),
          stats: manager.scratchpad.getStats(input.sessionId),
        };
        break;
      case "working":
        result.working = {
          hot: manager.working.getItems(input.sessionId, "hot").slice(0, 20),
          warm: manager.working.getItems(input.sessionId, "warm").slice(0, 20),
          stats: manager.working.getStats(input.sessionId),
        };
        break;
      case "episodic":
        result.episodic = {
          entries: manager.episodicIndex.getAll(input.sessionId).slice(0, 20),
          stats: manager.episodicIndex.getStats(input.sessionId),
        };
        break;
      case "semantic":
        result.semantic = {
          units: manager.semantic.getAll(input.sessionId).slice(0, 20),
          stats: manager.semantic.getStats(input.sessionId),
        };
        break;
      case "graph":
        result.graph = manager.graph.getStats(input.sessionId);
        break;
      case "curation":
        result.curation = {
          topEntries: manager.curator.getTopEntries(input.sessionId, 20),
          stats: manager.curator.getStats(input.sessionId),
        };
        break;
      case "callbacks":
        result.callbacks = {
          activePatterns: manager.callbacks.getActivePatterns(input.sessionId).slice(0, 20),
          stats: manager.callbacks.getStats(input.sessionId),
        };
        break;
    }
  }

  if (input.verifyIntegrity) {
    result.integrity = manager.verifyIntegrity(input.sessionId);
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
