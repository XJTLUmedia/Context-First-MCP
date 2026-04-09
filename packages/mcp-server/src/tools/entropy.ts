import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import { computeEntropy } from "../engine/entropy.js";
import { refineConversation } from "../engine/refiner.js";
import type { EntropyResult } from "../state/types.js";

export const entropyInputSchema = z.object({
  sessionId: z.string().default("default"),
  outputs: z
    .array(z.string())
    .describe("Recent LLM outputs to analyze for entropy"),
  threshold: z
    .number()
    .default(0.6)
    .describe("Composite score above which a spike is detected (0-1)"),
  autoReset: z
    .boolean()
    .default(false)
    .describe("If true, automatically run recap/refine when spike is detected"),
});

export type EntropyInput = z.infer<typeof entropyInputSchema>;

export function handleEntropy(store: SessionStore, input: EntropyInput) {
  const { sessionId, outputs, threshold, autoReset } = input;
  const session = store.getOrCreate(sessionId);

  const metrics = computeEntropy(
    outputs,
    session.groundTruth,
    session.history
  );

  const spikeDetected = metrics.compositeScore > threshold;
  const recommendation = spikeDetected ? "ergo_reset" : "normal";

  // Build window from history for trending
  const window: Array<{ turn: number; score: number }> = [];
  const recentHistory = session.history.slice(-10);
  for (const entry of recentHistory) {
    if (entry.role === "assistant") {
      const turnMetrics = computeEntropy(
        [entry.content],
        session.groundTruth,
        session.history.filter((h) => h.turn < entry.turn)
      );
      window.push({ turn: entry.turn, score: turnMetrics.compositeScore });
    }
  }

  const result: EntropyResult = {
    metrics,
    spikeDetected,
    threshold,
    recommendation,
    window,
  };

  // Auto-reset: run refiner to re-align context
  let autoResetPerformed = false;
  if (autoReset && spikeDetected && session.history.length > 0) {
    const recap = refineConversation(session.history, 10);
    store.setRecap(sessionId, recap);
    autoResetPerformed = true;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ...result,
            autoResetPerformed,
          },
          null,
          2
        ),
      },
    ],
  };
}
