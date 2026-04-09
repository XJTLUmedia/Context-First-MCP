import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionStore } from "./state/store.js";
import { SiloManager } from "./state/silo.js";
import { ToolCatalog } from "./registry/catalog.js";
import {
  recapInputSchema,
  handleRecap,
  type RecapInput,
} from "./tools/recap.js";
import {
  conflictInputSchema,
  handleConflict,
  type ConflictInput,
} from "./tools/conflict.js";
import {
  ambiguityInputSchema,
  handleAmbiguity,
  type AmbiguityInput,
} from "./tools/ambiguity.js";
import {
  verifyInputSchema,
  handleVerify,
  type VerifyInput,
} from "./tools/verify.js";
import {
  getStateInputSchema,
  handleGetState,
  type GetStateInput,
  setStateInputSchema,
  handleSetState,
  type SetStateInput,
  clearStateInputSchema,
  handleClearState,
  type ClearStateInput,
} from "./tools/state.js";
import {
  historyInputSchema,
  handleHistory,
  type HistoryInput,
} from "./tools/history.js";
import {
  discoverInputSchema,
  handleDiscover,
  type DiscoverInput,
} from "./tools/discover.js";
import {
  quarantineInputSchema,
  handleQuarantine,
  type QuarantineInput,
  mergeQuarantineInputSchema,
  handleMergeQuarantine,
  type MergeQuarantineInput,
} from "./tools/quarantine.js";
import {
  entropyInputSchema,
  handleEntropy,
  type EntropyInput,
} from "./tools/entropy.js";
import {
  abstentionInputSchema,
  handleAbstention,
  type AbstentionInput,
} from "./tools/abstention.js";

export { SessionStore } from "./state/store.js";
export { SiloManager } from "./state/silo.js";
export { ToolCatalog } from "./registry/catalog.js";
export { TfIdfIndexer } from "./registry/indexer.js";
export type * from "./state/types.js";
export type * from "./registry/types.js";

export interface CreateServerOptions {
  /** Server name shown to MCP clients */
  name?: string;
  /** Server version */
  version?: string;
}

/**
 * Create a Context-First MCP server with all 13 tools registered.
 * Returns the McpServer instance and the SessionStore for lifecycle management.
 */
export function createContextFirstServer(options: CreateServerOptions = {}) {
  const {
    name = "context-first-mcp",
    version = "1.0.0",
  } = options;

  const server = new McpServer({
    name,
    version,
  });

  const store = new SessionStore();
  const siloManager = new SiloManager(store);
  const catalog = new ToolCatalog();

  // ─── Gap 1: Lost in Conversation ───
  server.tool(
    "recap_conversation",
    "Analyze conversation history, identify hidden intents, and produce a consolidated state summary. Run every 2-3 turns to prevent context degradation.",
    recapInputSchema.shape,
    async (input: RecapInput) => handleRecap(store, input)
  );

  // ─── Gap 2: Context Clash ───
  server.tool(
    "detect_conflicts",
    "Compare new user input against established conversation ground truth. Detects contradictions, changed requirements, and shifted assumptions.",
    conflictInputSchema.shape,
    async (input: ConflictInput) => handleConflict(store, input)
  );

  // ─── Gap 3: Calibration & Trust ───
  server.tool(
    "check_ambiguity",
    "Analyze a requirement or instruction for underspecification. Returns clarifying questions that should be asked before proceeding.",
    ambiguityInputSchema.shape,
    async (input: AmbiguityInput) => handleAmbiguity(input)
  );

  // ─── Gap 4: Benchmark vs Reality ───
  server.tool(
    "verify_execution",
    "Validate that a tool output or action actually achieved its stated goal. Checks for common failure modes like silent errors, partial completion, and wrong-target execution.",
    verifyInputSchema.shape,
    async (input: VerifyInput) => handleVerify(input)
  );

  // ─── State Management ───
  server.tool(
    "get_state",
    "Retrieve the current conversation ground truth — confirmed facts, decisions, and task status.",
    getStateInputSchema.shape,
    async (input: GetStateInput) => handleGetState(store, input)
  );

  server.tool(
    "set_state",
    "Lock in a confirmed fact or decision to the conversation ground truth.",
    setStateInputSchema.shape,
    async (input: SetStateInput) => handleSetState(store, input)
  );

  server.tool(
    "clear_state",
    "Remove specific keys or reset the entire conversation ground truth.",
    clearStateInputSchema.shape,
    async (input: ClearStateInput) => handleClearState(store, input)
  );

  server.tool(
    "get_history_summary",
    "Get a compressed conversation history with intent annotations and key decision points highlighted.",
    historyInputSchema.shape,
    async (input: HistoryInput) => handleHistory(store, input)
  );

  // ─── Layer 2: Research-Backed Tools ───

  // ─── MCP-Zero: Tool Discovery ───
  server.tool(
    "discover_tools",
    "Semantically search for available tools by capability description. Uses TF-IDF indexing to match natural language queries to tool descriptions.",
    discoverInputSchema.shape,
    async (input: DiscoverInput) => handleDiscover(catalog, input)
  );

  // ─── Multi-Agent Quarantine ───
  server.tool(
    "quarantine_context",
    "Create an isolated state sandbox (silo) for exploratory or multi-agent workflows. Optionally inherit selected keys from the parent session.",
    quarantineInputSchema.shape,
    async (input: QuarantineInput) => handleQuarantine(siloManager, input)
  );

  server.tool(
    "merge_quarantine",
    "Merge or discard a quarantine silo. On merge, promoted keys are written back to the parent session ground truth.",
    mergeQuarantineInputSchema.shape,
    async (input: MergeQuarantineInput) =>
      handleMergeQuarantine(siloManager, input)
  );

  // ─── ERGO: Entropy Monitoring ───
  server.tool(
    "entropy_monitor",
    "Compute proxy entropy metrics from recent LLM outputs. Detects hedging, repetition, contradictions, and lexical degradation. Optionally auto-resets context on spike.",
    entropyInputSchema.shape,
    async (input: EntropyInput) => handleEntropy(store, input)
  );

  // ─── RLAAR: Abstention Check ───
  server.tool(
    "abstention_check",
    "Evaluate confidence across 5 dimensions to decide if the system should abstain from answering. Checks state completeness, recency, contradictions, ambiguity, and source quality.",
    abstentionInputSchema.shape,
    async (input: AbstentionInput) => handleAbstention(store, input)
  );

  // ─── Self-Register All 13 Tools in Catalog ───
  catalog.registerBatch([
    {
      name: "recap_conversation",
      description: "Analyze conversation history, identify hidden intents, and produce a consolidated state summary.",
      inputSchema: recapInputSchema.shape,
      tags: ["conversation", "recap", "summary", "history", "intent"],
    },
    {
      name: "detect_conflicts",
      description: "Compare new user input against established conversation ground truth. Detects contradictions and changed requirements.",
      inputSchema: conflictInputSchema.shape,
      tags: ["conflict", "contradiction", "detection", "ground-truth"],
    },
    {
      name: "check_ambiguity",
      description: "Analyze a requirement or instruction for underspecification. Returns clarifying questions.",
      inputSchema: ambiguityInputSchema.shape,
      tags: ["ambiguity", "clarification", "requirement", "quality"],
    },
    {
      name: "verify_execution",
      description: "Validate that a tool output or action actually achieved its stated goal.",
      inputSchema: verifyInputSchema.shape,
      tags: ["verification", "execution", "validation", "output"],
    },
    {
      name: "get_state",
      description: "Retrieve the current conversation ground truth — confirmed facts, decisions, and task status.",
      inputSchema: getStateInputSchema.shape,
      tags: ["state", "ground-truth", "read", "facts"],
    },
    {
      name: "set_state",
      description: "Lock in a confirmed fact or decision to the conversation ground truth.",
      inputSchema: setStateInputSchema.shape,
      tags: ["state", "ground-truth", "write", "lock"],
    },
    {
      name: "clear_state",
      description: "Remove specific keys or reset the entire conversation ground truth.",
      inputSchema: clearStateInputSchema.shape,
      tags: ["state", "ground-truth", "clear", "reset"],
    },
    {
      name: "get_history_summary",
      description: "Get a compressed conversation history with intent annotations and key decision points highlighted.",
      inputSchema: historyInputSchema.shape,
      tags: ["history", "summary", "decisions", "progression"],
    },
    {
      name: "discover_tools",
      description: "Semantically search for available tools by capability description using TF-IDF indexing.",
      inputSchema: discoverInputSchema.shape,
      tags: ["discovery", "search", "tools", "routing", "mcp-zero"],
    },
    {
      name: "quarantine_context",
      description: "Create an isolated state sandbox for exploratory or multi-agent workflows.",
      inputSchema: quarantineInputSchema.shape,
      tags: ["quarantine", "silo", "isolation", "multi-agent", "sandbox"],
    },
    {
      name: "merge_quarantine",
      description: "Merge or discard a quarantine silo. Merge promotes keys back to parent session.",
      inputSchema: mergeQuarantineInputSchema.shape,
      tags: ["quarantine", "merge", "discard", "silo"],
    },
    {
      name: "entropy_monitor",
      description: "Compute proxy entropy metrics from recent LLM outputs. Detects hedging, repetition, and contradictions.",
      inputSchema: entropyInputSchema.shape,
      tags: ["entropy", "ergo", "monitoring", "degradation", "quality"],
    },
    {
      name: "abstention_check",
      description: "Evaluate confidence across 5 dimensions to decide if the system should abstain from answering.",
      inputSchema: abstentionInputSchema.shape,
      tags: ["abstention", "confidence", "rlaar", "trust", "calibration"],
    },
  ]);

  return { server, store, siloManager, catalog };
}
