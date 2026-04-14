/**
 * Layer 1: Context Health — Context health checks + state management.
 * Packs 13 sub-tools with signal-based FSM auto-selection.
 *
 * Sub-tools:
 *   recap, conflict, ambiguity, verify, entropy, abstention,
 *   grounding, drift, depth, get_state, set_state, clear_state, history
 */
import { z } from "zod";
import { SessionStore } from "../state/store.js";
import { handleRecap, recapInputSchema } from "./recap.js";
import { handleConflict, conflictInputSchema } from "./conflict.js";
import { handleAmbiguity, ambiguityInputSchema } from "./ambiguity.js";
import { handleVerify, verifyInputSchema } from "./verify.js";
import { handleEntropy, entropyInputSchema } from "./entropy.js";
import { handleAbstention, abstentionInputSchema } from "./abstention.js";
import { handleGrounding, groundingInputSchema } from "./grounding.js";
import { handleDrift, driftInputSchema } from "./drift.js";
import { handleDepth, depthInputSchema } from "./depth.js";
import {
  handleGetState,
  getStateInputSchema,
  handleSetState,
  setStateInputSchema,
  handleClearState,
  clearStateInputSchema,
} from "./state.js";
import { handleHistory, historyInputSchema } from "./history.js";

const CHECK_NAMES = [
  "recap",
  "conflict",
  "ambiguity",
  "verify",
  "entropy",
  "abstention",
  "grounding",
  "drift",
  "depth",
  "get_state",
  "set_state",
  "clear_state",
  "history",
] as const;

export const contextHealthInputSchema = z.object({
  sessionId: z
    .string()
    .default("default")
    .describe("Session identifier"),
  check: z
    .enum(CHECK_NAMES)
    .optional()
    .describe(
      "Override: run a specific check. If omitted, auto-selects based on params. " +
        "clear_state shares params with get_state — use this override to disambiguate.",
    ),
  params: z
    .record(z.unknown())
    .default({})
    .describe(
      "Parameters for the underlying tool(s), minus sessionId. Multiple checks run if params match more than one tool. " +
        "recap: {messages[], lookbackTurns?}; conflict: {newMessage}; ambiguity: {requirement, context?}; " +
        "verify: {goal, output, expectedIndicators?}; entropy: {outputs[], threshold?, autoReset?}; " +
        "abstention: {claim, requiredKeys[], threshold?}; grounding: {assistantOutput, claim?}; " +
        "drift: {windowSize, turn?, health?, breakdown?}; depth: {content, minDepthWords?, minDepthSentences?}; " +
        "get_state: {keys?}; set_state: {key, value, source?}; clear_state: (use check override); " +
        "history: {maxTokens}",
    ),
});

export type ContextHealthInput = z.infer<typeof contextHealthInputSchema>;

// ─── FSM: select checks from param keys ───
function selectChecks(params: Record<string, unknown>): string[] {
  const selected: string[] = [];

  if ("messages" in params) selected.push("recap");
  if ("newMessage" in params) selected.push("conflict");
  if ("requirement" in params) selected.push("ambiguity");
  if ("goal" in params) selected.push("verify");
  if ("outputs" in params) selected.push("entropy");
  if ("requiredKeys" in params) selected.push("abstention");
  if ("assistantOutput" in params) selected.push("grounding");
  if (
    "windowSize" in params ||
    "breakdown" in params ||
    ("health" in params && !("requiredKeys" in params)) ||
    ("turn" in params && !("messages" in params))
  )
    selected.push("drift");
  if ("content" in params) selected.push("depth");
  if ("key" in params && "value" in params) selected.push("set_state");
  else if ("keys" in params && !("requiredKeys" in params))
    selected.push("get_state");
  if ("maxTokens" in params) selected.push("history");

  return selected;
}

// ─── Run a single check ───
async function runCheck(
  name: string,
  store: SessionStore,
  sessionId: string,
  params: Record<string, unknown>,
): Promise<{ tool: string; result: unknown; error?: string }> {
  try {
    switch (name) {
      case "recap": {
        const input = recapInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleRecap(store, input)) };
      }
      case "conflict": {
        const input = conflictInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleConflict(store, input)) };
      }
      case "ambiguity": {
        const input = ambiguityInputSchema.parse(params);
        return { tool: name, result: await Promise.resolve(handleAmbiguity(input)) };
      }
      case "verify": {
        const input = verifyInputSchema.parse(params);
        return { tool: name, result: await Promise.resolve(handleVerify(input)) };
      }
      case "entropy": {
        const input = entropyInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleEntropy(store, input)) };
      }
      case "abstention": {
        const input = abstentionInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleAbstention(store, input)) };
      }
      case "grounding": {
        const input = groundingInputSchema.parse({ sessionId, ...params });
        // handleGrounding returns raw GroundingResult — wrap it
        const raw = await Promise.resolve(handleGrounding(store, input));
        return { tool: name, result: { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] } };
      }
      case "drift": {
        const input = driftInputSchema.parse({ sessionId, ...params });
        // handleDrift returns raw DriftResult — wrap it
        const raw = await Promise.resolve(handleDrift(input));
        return { tool: name, result: { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] } };
      }
      case "depth": {
        const input = depthInputSchema.parse(params);
        return { tool: name, result: await Promise.resolve(handleDepth(input)) };
      }
      case "get_state": {
        const input = getStateInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleGetState(store, input)) };
      }
      case "set_state": {
        const input = setStateInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleSetState(store, input)) };
      }
      case "clear_state": {
        const input = clearStateInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleClearState(store, input)) };
      }
      case "history": {
        const input = historyInputSchema.parse({ sessionId, ...params });
        return { tool: name, result: await Promise.resolve(handleHistory(store, input)) };
      }
      default:
        return { tool: name, result: null, error: `Unknown check: ${name}` };
    }
  } catch (err) {
    return { tool: name, result: null, error: String(err) };
  }
}

// ─── Extract text payload for aggregation ───
function extractText(result: unknown): unknown {
  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content: Array<{ text: string }> }).content;
    if (Array.isArray(content) && content.length > 0 && content[0].text) {
      try {
        return JSON.parse(content[0].text);
      } catch {
        return content[0].text;
      }
    }
  }
  return result;
}

// ─── Main handler ───
export async function handleContextHealth(
  store: SessionStore,
  input: ContextHealthInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { sessionId, check, params } = input;
  const tools = check ? [check] : selectChecks(params);

  if (tools.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error:
                "No check could be inferred from params. Provide 'check' or pass recognizable params.",
              availableChecks: CHECK_NAMES,
              paramHints: {
                recap: "messages[]",
                conflict: "newMessage",
                ambiguity: "requirement",
                verify: "goal, output",
                entropy: "outputs[]",
                abstention: "claim, requiredKeys[]",
                grounding: "assistantOutput",
                drift: "windowSize",
                depth: "content",
                set_state: "key, value",
                get_state: "keys",
                clear_state: "(use check:'clear_state')",
                history: "maxTokens",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Single tool → transparent proxy
  if (tools.length === 1) {
    const { result, error } = await runCheck(tools[0], store, sessionId, params);
    if (error) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ tool: tools[0], error }, null, 2) }],
      };
    }
    return result as { content: Array<{ type: "text"; text: string }> };
  }

  // Multiple tools → aggregate results
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const tool of tools) {
    const { result, error } = await runCheck(tool, store, sessionId, params);
    if (error) {
      errors[tool] = error;
    } else {
      results[tool] = extractText(result);
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            layer: "context_health",
            selectedChecks: tools,
            results,
            ...(Object.keys(errors).length > 0 ? { errors } : {}),
          },
          null,
          2,
        ),
      },
    ],
  };
}
