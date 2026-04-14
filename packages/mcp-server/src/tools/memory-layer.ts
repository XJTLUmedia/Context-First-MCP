/**
 * Layer 3: Memory — Hierarchical memory management.
 * Packs 6 sub-tools with FSM auto-selection based on params.
 */
import { z } from "zod";
import { UnifiedMemoryManager } from "../memory/manager.js";
import {
  memoryStoreInputSchema,
  handleMemoryStore,
} from "./memory-store.js";
import {
  memoryRecallInputSchema,
  handleMemoryRecall,
} from "./memory-recall.js";
import {
  memoryCompactInputSchema,
  handleMemoryCompact,
} from "./memory-compact.js";
import {
  memoryGraphInputSchema,
  handleMemoryGraph,
} from "./memory-graph.js";
import {
  memoryInspectInputSchema,
  handleMemoryInspect,
} from "./memory-inspect.js";
import {
  memoryCurateInputSchema,
  handleMemoryCurate,
} from "./memory-curate.js";

const ACTION_NAMES = [
  "store",
  "recall",
  "compact",
  "graph",
  "inspect",
  "curate",
] as const;

const GRAPH_ACTIONS = new Set(["query", "stats", "recompute"]);
const CURATE_ACTIONS = new Set([
  "top",
  "filterByDomain",
  "mostReused",
  "prune",
]);

export const memoryLayerInputSchema = z.object({
  sessionId: z
    .string()
    .default("default")
    .describe("Session identifier"),
  action: z
    .enum(ACTION_NAMES)
    .optional()
    .describe(
      "Override: run a specific memory action. If omitted, auto-selects based on params. " +
        "store — pass {role, content}; recall — pass {query}; compact — pass {targetRatio?}; " +
        "graph — pass {action:'query'|'stats'|'recompute'}; inspect — pass {tier?}; " +
        "curate — pass {action:'top'|'filterByDomain'|'mostReused'|'prune'}",
    ),
  params: z
    .record(z.unknown())
    .default({})
    .describe(
      "Parameters for the underlying tool. " +
        "store: {role, content, metadata?}; " +
        "recall: {query, maxResults?, turnCount?, entropy?, conflicts?}; " +
        "compact: {targetRatio?, preserveRecency?}; " +
        "graph: {action:'query'|'stats'|'recompute', startEntity?, depth?}; " +
        "inspect: {tier?, runIntegrityCheck?}; " +
        "curate: {action:'top'|'filterByDomain'|'mostReused'|'prune', domainTag?, threshold?}",
    ),
});

export type MemoryLayerInput = z.infer<typeof memoryLayerInputSchema>;

// ─── FSM: select action from params ───
function selectAction(params: Record<string, unknown>): string | null {
  // store: has role + content
  if ("role" in params && "content" in params) return "store";

  // recall: has query (without role)
  if ("query" in params && !("role" in params)) return "recall";

  // graph vs curate: both have 'action' field but with disjoint values
  if ("action" in params && typeof params.action === "string") {
    if (GRAPH_ACTIONS.has(params.action)) return "graph";
    if (CURATE_ACTIONS.has(params.action)) return "curate";
  }

  // compact: has targetRatio or preserveRecency
  if ("targetRatio" in params || "preserveRecency" in params) return "compact";

  // inspect: has tier or runIntegrityCheck
  if ("tier" in params || "runIntegrityCheck" in params) return "inspect";

  // graph: has startEntity or depth (without action — default to query)
  if ("startEntity" in params || "depth" in params) return "graph";

  // curate: has domainTag or threshold (without action)
  if ("domainTag" in params) return "curate";

  return null;
}

// ─── Dispatcher ───
async function runAction(
  name: string,
  memoryManager: UnifiedMemoryManager,
  params: Record<string, unknown>,
): Promise<{ tool: string; result: unknown; error?: string }> {
  try {
    switch (name) {
      case "store": {
        const input = memoryStoreInputSchema.parse(params);
        const result = await Promise.resolve(
          handleMemoryStore(memoryManager, input),
        );
        return { tool: name, result };
      }
      case "recall": {
        const input = memoryRecallInputSchema.parse(params);
        const result = await Promise.resolve(
          handleMemoryRecall(memoryManager, input),
        );
        return { tool: name, result };
      }
      case "compact": {
        const input = memoryCompactInputSchema.parse(params);
        const result = await Promise.resolve(
          handleMemoryCompact(memoryManager, input),
        );
        return { tool: name, result };
      }
      case "graph": {
        const input = memoryGraphInputSchema.parse(params);
        const result = await Promise.resolve(
          handleMemoryGraph(memoryManager, input),
        );
        return { tool: name, result };
      }
      case "inspect": {
        const input = memoryInspectInputSchema.parse(params);
        const result = await Promise.resolve(
          handleMemoryInspect(memoryManager, input),
        );
        return { tool: name, result };
      }
      case "curate": {
        const input = memoryCurateInputSchema.parse(params);
        const result = await Promise.resolve(
          handleMemoryCurate(memoryManager, input),
        );
        return { tool: name, result };
      }
      default:
        return { tool: name, result: null, error: `Unknown action: ${name}` };
    }
  } catch (err) {
    return { tool: name, result: null, error: String(err) };
  }
}

// ─── Main handler ───
export async function handleMemoryLayer(
  memoryManager: UnifiedMemoryManager,
  input: MemoryLayerInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { action: override, params } = input;
  const selected = override ?? selectAction(params);

  if (!selected) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error:
                "No action could be inferred from params. Provide 'action' or pass recognizable params.",
              availableActions: ACTION_NAMES,
              paramHints: {
                store: "role, content, metadata?",
                recall: "query, maxResults?, turnCount?",
                compact: "targetRatio?, preserveRecency?",
                graph: "action:'query'|'stats'|'recompute', startEntity?, depth?",
                inspect: "tier?, runIntegrityCheck?",
                curate:
                  "action:'top'|'filterByDomain'|'mostReused'|'prune', domainTag?, threshold?",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const { result, error } = await runAction(selected, memoryManager, params);

  if (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ tool: selected, error }, null, 2),
        },
      ],
    };
  }

  return result as { content: Array<{ type: "text"; text: string }> };
}
