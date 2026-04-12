import { z } from "zod";
import type { SessionStore } from "../state/store.js";
import type { ToolCatalog } from "../registry/catalog.js";
import { runUnifiedLoop } from "../engine/loop.js";
import { recordLoopCall } from "../engine/loop-freshness.js";

export const loopInputSchema = z.object({
  sessionId: z.string().default("default"),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    turn: z.number().describe("Sequential turn number starting from 1"),
  })).default([]).describe("Recent conversation messages. Include at least the last 2-3 user/assistant exchanges. Example: [{role:'user', content:'explain X', turn:1}, {role:'assistant', content:'X is...', turn:2}]. If empty, the loop runs with reduced context."),
  currentInput: z.string().optional().describe("The current user message or task description. Auto-inferred from last user message in messages array if omitted."),
  claim: z.string().optional().describe("A specific assertion or answer to fact-check for confidence evaluation"),
  discoveryQuery: z.string().optional().describe("What capability do you need? e.g. 'store research findings' or 'compress reasoning chain'"),
  lookbackTurns: z.number().default(10).describe("How many turns to analyze (use 15-20 for research or long conversations)"),
  entropyThreshold: z.number().default(0.6).describe("Entropy spike detection threshold (0-1)"),
  abstentionThreshold: z.number().default(0.6).describe("Abstention confidence threshold (0-1)"),
});

export type LoopToolInput = z.infer<typeof loopInputSchema>;

export function handleLoop(store: SessionStore, catalog: ToolCatalog, input: LoopToolInput) {
  // Record that context_loop was called — resets the freshness counter
  recordLoopCall(input.sessionId);

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
          depth: result.depth,
          timestamp: result.timestamp,
        }, null, 2),
      },
    ],
  };
}
