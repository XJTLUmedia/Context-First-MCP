/**
 * Layer 4: Reasoning — Advanced reasoning paradigms.
 * Packs 5 sub-tools with FSM auto-selection based on problem type signals.
 */
import { z } from "zod";
import {
  inftythinkInputSchema,
  handleInftyThink,
} from "./inftythink.js";
import {
  coconutInputSchema,
  handleCoconut,
} from "./coconut.js";
import {
  extracotInputSchema,
  handleExtraCoT,
} from "./extracot.js";
import {
  mindevolutionInputSchema,
  handleMindEvolution,
} from "./mindevolution.js";
import {
  kagthinkerInputSchema,
  handleKAGThinker,
} from "./kagthinker.js";

const METHOD_NAMES = [
  "inftythink",
  "coconut",
  "extracot",
  "mindevolution",
  "kagthinker",
] as const;

export const reasonInputSchema = z.object({
  sessionId: z
    .string()
    .default("default")
    .describe("Session identifier"),
  method: z
    .enum(METHOD_NAMES)
    .optional()
    .describe(
      "Override: run a specific reasoning method. If omitted, auto-selects based on params. " +
        "inftythink — iterative bounded reasoning (default for raw problems); " +
        "coconut — multi-perspective latent-space analysis; " +
        "extracot — compress existing reasoning steps; " +
        "mindevolution — evolutionary search over seed solutions; " +
        "kagthinker — structured logical decomposition with dependency graph",
    ),
  params: z
    .record(z.unknown())
    .default({})
    .describe(
      "Parameters for the underlying reasoning engine. " +
        "inftythink: {problem, priorContext?, maxSegments?, maxSegmentTokens?, summaryRatio?}; " +
        "coconut: {problem, maxSteps?, breadth?, enableBreadthExploration?}; " +
        "extracot: {reasoningSteps[], problem?, maxBudget?, targetCompression?, minFidelity?}; " +
        "mindevolution: {problem, criteria?, populationSize?, maxGenerations?, seedResponses[]}; " +
        "kagthinker: {problem, knownFacts?, maxDepth?, maxSteps?}",
    ),
});

export type ReasonInput = z.infer<typeof reasonInputSchema>;

// ─── FSM: select method from params ───
function selectMethod(params: Record<string, unknown>): string {
  // Unique signals — these fields only appear in one tool
  if ("reasoningSteps" in params) return "extracot";
  if ("seedResponses" in params) return "mindevolution";
  if ("knownFacts" in params) return "kagthinker";

  // Strong hints
  if ("priorContext" in params) return "inftythink";
  if (
    "breadth" in params ||
    "enableBreadthExploration" in params
  )
    return "coconut";
  if ("populationSize" in params || "maxGenerations" in params)
    return "mindevolution";
  if ("maxDepth" in params) return "kagthinker";

  // Compression-specific hints
  if (
    "maxBudget" in params ||
    "targetCompression" in params ||
    "minFidelity" in params
  )
    return "extracot";

  // Default: inftythink is the most general-purpose reasoner
  return "inftythink";
}

// ─── Dispatcher ───
async function runMethod(
  name: string,
  params: Record<string, unknown>,
): Promise<{ tool: string; result: unknown; error?: string }> {
  try {
    switch (name) {
      case "inftythink": {
        const input = inftythinkInputSchema.parse(params);
        const result = await Promise.resolve(handleInftyThink(input));
        return { tool: name, result };
      }
      case "coconut": {
        const input = coconutInputSchema.parse(params);
        const result = await Promise.resolve(handleCoconut(input));
        return { tool: name, result };
      }
      case "extracot": {
        const input = extracotInputSchema.parse(params);
        const result = await Promise.resolve(handleExtraCoT(input));
        return { tool: name, result };
      }
      case "mindevolution": {
        const input = mindevolutionInputSchema.parse(params);
        const result = await Promise.resolve(handleMindEvolution(input));
        return { tool: name, result };
      }
      case "kagthinker": {
        const input = kagthinkerInputSchema.parse(params);
        const result = await Promise.resolve(handleKAGThinker(input));
        return { tool: name, result };
      }
      default:
        return { tool: name, result: null, error: `Unknown method: ${name}` };
    }
  } catch (err) {
    return { tool: name, result: null, error: String(err) };
  }
}

// ─── Main handler ───
export async function handleReason(
  input: ReasonInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { method: override, params } = input;
  const selected = override ?? selectMethod(params);

  const { result, error } = await runMethod(selected, params);

  if (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              tool: selected,
              error,
              availableMethods: METHOD_NAMES,
              paramHints: {
                inftythink: "problem, priorContext?, maxSegments?",
                coconut: "problem, breadth?, enableBreadthExploration?",
                extracot: "reasoningSteps[], problem?, maxBudget?",
                mindevolution: "problem, seedResponses[], criteria?",
                kagthinker: "problem, knownFacts?, maxDepth?",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return result as { content: Array<{ type: "text"; text: string }> };
}
