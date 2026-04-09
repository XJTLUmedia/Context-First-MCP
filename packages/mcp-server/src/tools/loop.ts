import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import type { ToolCatalog } from "../registry/catalog.js";
import { runUnifiedLoop } from "../engine/loop.js";

export const loopInputSchema = z.object({
  sessionId: z.string().default("default"),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    turn: z.number(),
  })).describe("Recent conversation messages to process through the unified loop"),
  currentInput: z.string().optional().describe("Latest user message for conflict & ambiguity analysis. Auto-inferred from last user message if omitted."),
  claim: z.string().optional().describe("Assertion to evaluate for abstention check"),
  discoveryQuery: z.string().optional().describe("Natural language query for tool recommendation"),
  lookbackTurns: z.number().default(5).describe("Number of turns for recap analysis"),
  entropyThreshold: z.number().default(0.6).describe("Entropy spike detection threshold (0-1)"),
  abstentionThreshold: z.number().default(0.6).describe("Abstention confidence threshold (0-1)"),
});

export type LoopToolInput = z.infer<typeof loopInputSchema>;

export function handleLoop(store: SessionStore, catalog: ToolCatalog, input: LoopToolInput) {
  const result = runUnifiedLoop(store, catalog, {
    sessionId: input.sessionId,
    messages: input.messages,
    currentInput: input.currentInput,
    claim: input.claim,
    discoveryQuery: input.discoveryQuery,
    lookbackTurns: input.lookbackTurns,
    entropyThreshold: input.entropyThreshold,
    abstentionThreshold: input.abstentionThreshold,
  });

  // Return directive first so LLMs read the actionable instruction before detail
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          directive: result.directive,
          action: result.action,
          summary: result.summary,
          sessionId: result.sessionId,
          stages: result.stages,
          recap: result.recap,
          conflicts: result.conflicts,
          ambiguity: result.ambiguity,
          entropy: result.entropy,
          abstention: result.abstention,
          discovery: result.discovery,
          grounding: result.grounding,
          drift: result.drift,
          timestamp: result.timestamp,
        }, null, 2),
      },
    ],
  };
}
