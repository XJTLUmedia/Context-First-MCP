import { z } from "zod";
import type { UnifiedMemoryManager } from "../memory/manager.js";

export const memoryCurateInputSchema = z.object({
  sessionId: z.string().default("default"),
  action: z
    .enum(["top", "tags", "reused", "prune"])
    .default("top")
    .describe("Curation action: get top entries, filter by tags, get most reused, or prune low-importance"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags to filter by (required if action=tags)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum entries to return"),
});

export type MemoryCurateInput = z.infer<typeof memoryCurateInputSchema>;

export function handleMemoryCurate(
  manager: UnifiedMemoryManager,
  input: MemoryCurateInput
) {
  switch (input.action) {
    case "tags": {
      const tags = input.tags ?? [];
      const entries = manager.curator.getByTags(input.sessionId, tags, input.limit);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sessionId: input.sessionId,
                action: "tags",
                tags,
                entries: entries.map((e) => ({
                  id: e.id,
                  content: e.content.slice(0, 200),
                  importance: Number(e.importance.toFixed(4)),
                  tags: e.tags,
                  reuseCount: e.reuseCount,
                })),
                count: entries.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "reused": {
      const entries = manager.curator.getMostReused(input.sessionId, input.limit);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sessionId: input.sessionId,
                action: "reused",
                entries: entries.map((e) => ({
                  id: e.id,
                  content: e.content.slice(0, 200),
                  importance: Number(e.importance.toFixed(4)),
                  tags: e.tags,
                  reuseCount: e.reuseCount,
                })),
                count: entries.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "prune": {
      const prunedCount = manager.curator.prune(input.sessionId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sessionId: input.sessionId,
                action: "prune",
                prunedCount,
                remainingStats: manager.curator.getStats(input.sessionId),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "top":
    default: {
      const entries = manager.curator.getTopEntries(input.sessionId, input.limit);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                sessionId: input.sessionId,
                action: "top",
                entries: entries.map((e) => ({
                  id: e.id,
                  content: e.content.slice(0, 200),
                  importance: Number(e.importance.toFixed(4)),
                  tags: e.tags,
                  reuseCount: e.reuseCount,
                })),
                count: entries.length,
                stats: manager.curator.getStats(input.sessionId),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
}
