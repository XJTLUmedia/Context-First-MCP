/**
 * Layer 5: Truthfulness — Truth verification & self-correction.
 * Packs 7 sub-tools with FSM auto-selection + optional cascade.
 *
 * Sub-tools:
 *   probe, truth_direction, ncb, logic, verify_first, ioe, self_critique
 *
 * When assistantOutput is provided without a discriminating hint, BOTH
 * probe + truth_direction run together (complementary checks).
 */
import { z } from "zod";
import { SessionStore } from "../state/store.js";
import {
  internalStateInputSchema,
  handleInternalState,
} from "./internal-state.js";
import {
  truthDirectionInputSchema,
  handleTruthDirection,
} from "./truth-direction.js";
import {
  neighborhoodInputSchema,
  handleNeighborhood,
} from "./neighborhood.js";
import {
  logicalConsistencyInputSchema,
  handleLogicalConsistency,
} from "./logical-consistency.js";
import {
  verifyFirstInputSchema,
  handleVerifyFirst,
} from "./verify-first.js";
import {
  ioeSelfCorrectInputSchema,
  handleIoeSelfCorrect,
} from "./ioe-self-correct.js";
import {
  selfCritiqueInputSchema,
  handleSelfCritique,
} from "./self-critique.js";

const CHECK_NAMES = [
  "probe",
  "truth_direction",
  "ncb",
  "logic",
  "verify_first",
  "ioe",
  "self_critique",
] as const;

export const truthcheckInputSchema = z.object({
  sessionId: z
    .string()
    .default("default")
    .describe("Session identifier"),
  check: z
    .enum(CHECK_NAMES)
    .optional()
    .describe(
      "Override: run a specific truthfulness check. If omitted, auto-selects based on params. " +
        "probe — linguistic truth proxy signals; truth_direction — truth vector projection; " +
        "ncb — perturbation robustness; logic — formal logical consistency; " +
        "verify_first — 5-dimension verification; ioe — confidence-based self-correction; " +
        "self_critique — iterative multi-criteria refinement",
    ),
  cascade: z
    .boolean()
    .default(false)
    .describe(
      "If true, after primary checks, auto-run ioe_self_correct → self_critique " +
        "when any extracted truthfulness score falls below 0.5.",
    ),
  params: z
    .record(z.unknown())
    .default({})
    .describe(
      "Parameters for the underlying tool(s), minus sessionId. " +
        "probe: {assistantOutput, includeHistory?}; " +
        "truth_direction: {assistantOutput, includePriorOutputs?}; " +
        "ncb: {originalQuery, response}; " +
        "logic: {claims[], includeGroundTruth?}; " +
        "verify_first: {candidateAnswer, question, context?}; " +
        "ioe: {response, question?, priorAttempts?}; " +
        "self_critique: {solution, criteria?, maxIterations?, question?}",
    ),
});

export type TruthcheckInput = z.infer<typeof truthcheckInputSchema>;

// ─── FSM: select checks from param keys ───
function selectChecks(params: Record<string, unknown>): string[] {
  const selected: string[] = [];

  // Unique signals
  if ("claims" in params) selected.push("logic");
  if ("candidateAnswer" in params) selected.push("verify_first");
  if ("solution" in params) selected.push("self_critique");
  if ("originalQuery" in params) selected.push("ncb");

  // assistantOutput → probe + truth_direction (complementary pair)
  if ("assistantOutput" in params) {
    if ("includeHistory" in params && !("includePriorOutputs" in params)) {
      selected.push("probe");
    } else if (
      "includePriorOutputs" in params &&
      !("includeHistory" in params)
    ) {
      selected.push("truth_direction");
    } else {
      // Both or neither discriminator → run both
      selected.push("probe");
      selected.push("truth_direction");
    }
  }

  // response (without originalQuery/solution) → ioe
  if (
    "response" in params &&
    !("originalQuery" in params) &&
    !("solution" in params)
  )
    selected.push("ioe");
  if ("priorAttempts" in params && !selected.includes("ioe"))
    selected.push("ioe");

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
      case "probe": {
        const input = internalStateInputSchema.parse({
          sessionId,
          ...params,
        });
        return {
          tool: name,
          result: await Promise.resolve(handleInternalState(store, input)),
        };
      }
      case "truth_direction": {
        const input = truthDirectionInputSchema.parse({
          sessionId,
          ...params,
        });
        return {
          tool: name,
          result: await Promise.resolve(handleTruthDirection(store, input)),
        };
      }
      case "ncb": {
        const input = neighborhoodInputSchema.parse({
          sessionId,
          ...params,
        });
        return {
          tool: name,
          result: await Promise.resolve(handleNeighborhood(store, input)),
        };
      }
      case "logic": {
        const input = logicalConsistencyInputSchema.parse({
          sessionId,
          ...params,
        });
        return {
          tool: name,
          result: await Promise.resolve(
            handleLogicalConsistency(store, input),
          ),
        };
      }
      case "verify_first": {
        const input = verifyFirstInputSchema.parse({
          sessionId,
          ...params,
        });
        return {
          tool: name,
          result: await Promise.resolve(handleVerifyFirst(store, input)),
        };
      }
      case "ioe": {
        const input = ioeSelfCorrectInputSchema.parse({
          sessionId,
          ...params,
        });
        return {
          tool: name,
          result: await Promise.resolve(handleIoeSelfCorrect(store, input)),
        };
      }
      case "self_critique": {
        const input = selfCritiqueInputSchema.parse({
          sessionId,
          ...params,
        });
        return {
          tool: name,
          result: await Promise.resolve(handleSelfCritique(store, input)),
        };
      }
      default:
        return { tool: name, result: null, error: `Unknown check: ${name}` };
    }
  } catch (err) {
    return { tool: name, result: null, error: String(err) };
  }
}

// ─── Score extraction for cascade ───
const SCORE_KEYS = [
  "overallTruthfulness",
  "overallAlignment",
  "ncbScore",
  "consistencyScore",
  "overallScore",
  "confidence",
  "initialQuality",
];

function extractTextAndScore(result: unknown): {
  data: unknown;
  score: number | null;
} {
  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content: Array<{ text: string }> }).content;
    if (Array.isArray(content) && content.length > 0 && content[0].text) {
      try {
        const parsed = JSON.parse(content[0].text);
        for (const key of SCORE_KEYS) {
          if (typeof parsed[key] === "number") {
            return { data: parsed, score: parsed[key] };
          }
        }
        return { data: parsed, score: null };
      } catch {
        return { data: content[0].text, score: null };
      }
    }
  }
  return { data: result, score: null };
}

// ─── Main handler ───
export async function handleTruthcheck(
  store: SessionStore,
  input: TruthcheckInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { sessionId, check, cascade, params } = input;
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
                probe: "assistantOutput, includeHistory?",
                truth_direction: "assistantOutput, includePriorOutputs?",
                ncb: "originalQuery, response",
                logic: "claims[]",
                verify_first: "candidateAnswer, question",
                ioe: "response, question?, priorAttempts?",
                self_critique: "solution, criteria?, maxIterations?",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // Single tool without cascade → transparent proxy
  if (tools.length === 1 && !cascade) {
    const { result, error } = await runCheck(
      tools[0],
      store,
      sessionId,
      params,
    );
    if (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ tool: tools[0], error }, null, 2),
          },
        ],
      };
    }
    return result as { content: Array<{ type: "text"; text: string }> };
  }

  // Multiple tools or cascade → aggregate
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  let minScore: number | null = null;

  for (const tool of tools) {
    const { result, error } = await runCheck(tool, store, sessionId, params);
    if (error) {
      errors[tool] = error;
    } else {
      const { data, score } = extractTextAndScore(result);
      results[tool] = data;
      if (score !== null && (minScore === null || score < minScore)) {
        minScore = score;
      }
    }
  }

  // ─── Cascade tail: low score → ioe_self_correct → self_critique ───
  const cascadeRan: string[] = [];
  if (cascade && minScore !== null && minScore < 0.5) {
    // Build ioe input from available params
    const ioeSrc =
      (params.response as string | undefined) ??
      (params.assistantOutput as string | undefined) ??
      (params.candidateAnswer as string | undefined);

    if (ioeSrc && !tools.includes("ioe")) {
      const ioeParams: Record<string, unknown> = { response: ioeSrc };
      if (params.question) ioeParams.question = params.question;
      const { result, error } = await runCheck(
        "ioe",
        store,
        sessionId,
        ioeParams,
      );
      cascadeRan.push("ioe");
      if (error) {
        errors["ioe_cascade"] = error;
      } else {
        results["ioe_cascade"] = extractTextAndScore(result).data;
      }
    }

    // self_critique
    const critiqueSrc =
      (params.solution as string | undefined) ??
      ioeSrc;

    if (critiqueSrc && !tools.includes("self_critique")) {
      const critiqueParams: Record<string, unknown> = {
        solution: critiqueSrc,
      };
      if (params.question) critiqueParams.question = params.question;
      const { result, error } = await runCheck(
        "self_critique",
        store,
        sessionId,
        critiqueParams,
      );
      cascadeRan.push("self_critique");
      if (error) {
        errors["self_critique_cascade"] = error;
      } else {
        results["self_critique_cascade"] =
          extractTextAndScore(result).data;
      }
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            layer: "truthcheck",
            selectedChecks: tools,
            ...(cascadeRan.length > 0
              ? { cascadeTriggered: true, cascadeChecks: cascadeRan }
              : {}),
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
