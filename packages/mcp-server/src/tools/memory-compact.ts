import { z } from "zod";
import type { UnifiedMemoryManager } from "../memory/manager.js";

export const memoryCompactInputSchema = z.object({
  sessionId: z.string().default("default"),
});

export type MemoryCompactInput = z.infer<typeof memoryCompactInputSchema>;

export function handleMemoryCompact(
  manager: UnifiedMemoryManager,
  input: MemoryCompactInput
) {
  const result = manager.compact(input.sessionId);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sessionId: input.sessionId,
            integrity: {
              totalFacts: result.integrity.totalFacts,
              retainedFacts: result.integrity.retainedFacts,
              lostFacts: result.integrity.lostFacts,
              lossPercentage: Number(
                (result.integrity.lossPercentage * 100).toFixed(4)
              ),
              verified: result.integrity.verified,
              verificationDurationMs:
                result.integrity.verificationDurationMs,
            },
            compression: {
              beforeChars: result.compressionStats.beforeChars,
              afterChars: result.compressionStats.afterChars,
              ratio: Number(result.compressionStats.ratio.toFixed(2)),
              sentencesProcessed:
                result.compressionStats.sentencesProcessed,
              unitsCreated: result.compressionStats.unitsCreated,
            },
            status: result.integrity.verified
              ? "compaction_verified"
              : "WARNING_LOSS_EXCEEDED",
          },
          null,
          2
        ),
      },
    ],
  };
}
