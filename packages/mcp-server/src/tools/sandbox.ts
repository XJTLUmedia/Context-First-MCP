/**
 * Layer 2: Sandbox — Tool discovery, quarantine isolation, and merge.
 * Packs 3 sub-tools with FSM auto-selection based on params.
 */
import { z } from "zod";
import { ToolCatalog } from "../registry/catalog.js";
import { SiloManager } from "../state/silo.js";
import {
  discoverInputSchema,
  handleDiscover,
} from "./discover.js";
import {
  quarantineInputSchema,
  handleQuarantine,
  mergeQuarantineInputSchema,
  handleMergeQuarantine,
} from "./quarantine.js";

const ACTION_NAMES = ["discover", "quarantine", "merge"] as const;

export const sandboxInputSchema = z.object({
  sessionId: z
    .string()
    .default("default")
    .describe("Session identifier (used by quarantine/merge)"),
  action: z
    .enum(ACTION_NAMES)
    .optional()
    .describe(
      "Override: run a specific action. If omitted, auto-selects based on params. " +
        "discover — pass {query}; quarantine — pass {name}; merge — pass {siloId, action:'merge'|'discard'}",
    ),
  params: z
    .record(z.unknown())
    .default({})
    .describe(
      "Parameters for the underlying tool. " +
        "discover: {query, maxResults?, minScore?}; " +
        "quarantine: {name, inheritKeys?, ttl?}; " +
        "merge: {siloId, action:'merge'|'discard', promoteKeys?}",
    ),
});

export type SandboxInput = z.infer<typeof sandboxInputSchema>;

// ─── FSM: select action from params ───
function selectAction(params: Record<string, unknown>): string | null {
  if ("query" in params && !("siloId" in params)) return "discover";
  if ("siloId" in params) return "merge";
  if ("name" in params && !("siloId" in params)) return "quarantine";
  return null;
}

// ─── Dispatcher ───
async function runAction(
  name: string,
  catalog: ToolCatalog,
  siloManager: SiloManager,
  sessionId: string,
  params: Record<string, unknown>,
): Promise<{ tool: string; result: unknown; error?: string }> {
  try {
    switch (name) {
      case "discover": {
        const input = discoverInputSchema.parse(params);
        const result = await Promise.resolve(handleDiscover(catalog, input));
        return { tool: name, result };
      }
      case "quarantine": {
        const input = quarantineInputSchema.parse({ sessionId, ...params });
        const result = await Promise.resolve(
          handleQuarantine(siloManager, input),
        );
        return { tool: name, result };
      }
      case "merge": {
        const input = mergeQuarantineInputSchema.parse(params);
        const result = await Promise.resolve(
          handleMergeQuarantine(siloManager, input),
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
export async function handleSandbox(
  catalog: ToolCatalog,
  siloManager: SiloManager,
  input: SandboxInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { sessionId, action: override, params } = input;
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
                discover: "query, maxResults?, minScore?",
                quarantine: "name, inheritKeys?, ttl?",
                merge: "siloId, action:'merge'|'discard', promoteKeys?",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const { result, error } = await runAction(
    selected,
    catalog,
    siloManager,
    sessionId,
    params,
  );

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

  // Transparent proxy — return sub-tool result as-is
  return result as { content: Array<{ type: "text"; text: string }> };
}
