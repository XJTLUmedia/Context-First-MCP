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
import {
  loopInputSchema,
  handleLoop,
  type LoopToolInput,
} from "./tools/loop.js";
import {
  groundingInputSchema,
  handleGrounding,
  type GroundingInput,
} from "./tools/grounding.js";
import {
  driftInputSchema,
  handleDrift,
  type DriftInput,
} from "./tools/drift.js";
import {
  depthInputSchema,
  handleDepth,
  type DepthToolInput,
} from "./tools/depth.js";
import {
  memoryStoreInputSchema,
  handleMemoryStore,
  type MemoryStoreInput,
} from "./tools/memory-store.js";
import {
  memoryRecallInputSchema,
  handleMemoryRecall,
  type MemoryRecallInput,
} from "./tools/memory-recall.js";
import {
  memoryCompactInputSchema,
  handleMemoryCompact,
  type MemoryCompactInput,
} from "./tools/memory-compact.js";
import {
  memoryGraphInputSchema,
  handleMemoryGraph,
  type MemoryGraphInput,
} from "./tools/memory-graph.js";
import {
  memoryInspectInputSchema,
  handleMemoryInspect,
  type MemoryInspectInput,
} from "./tools/memory-inspect.js";
import {
  memoryCurateInputSchema,
  handleMemoryCurate,
  type MemoryCurateInput,
} from "./tools/memory-curate.js";
import {
  inftythinkInputSchema,
  handleInftyThink,
  type InftyThinkToolInput,
} from "./tools/inftythink.js";
import {
  coconutInputSchema,
  handleCoconut,
  type CoconutToolInput,
} from "./tools/coconut.js";
import {
  extracotInputSchema,
  handleExtraCoT,
  type ExtraCoTToolInput,
} from "./tools/extracot.js";
import {
  mindevolutionInputSchema,
  handleMindEvolution,
  type MindEvolutionToolInput,
} from "./tools/mindevolution.js";
import {
  kagthinkerInputSchema,
  handleKAGThinker,
  type KAGThinkerToolInput,
} from "./tools/kagthinker.js";
import {
  internalStateInputSchema,
  handleInternalState,
  type InternalStateInput,
} from "./tools/internal-state.js";
import {
  truthDirectionInputSchema,
  handleTruthDirection,
  type TruthDirectionInput,
} from "./tools/truth-direction.js";
import {
  neighborhoodInputSchema,
  handleNeighborhood,
  type NeighborhoodInput,
} from "./tools/neighborhood.js";
import {
  logicalConsistencyInputSchema,
  handleLogicalConsistency,
  type LogicalConsistencyInput,
} from "./tools/logical-consistency.js";
import {
  verifyFirstInputSchema,
  handleVerifyFirst,
  type VerifyFirstInput,
} from "./tools/verify-first.js";
import {
  ioeSelfCorrectInputSchema,
  handleIoeSelfCorrect,
  type IoeSelfCorrectInput,
} from "./tools/ioe-self-correct.js";
import {
  selfCritiqueInputSchema,
  handleSelfCritique,
  type SelfCritiqueInput,
} from "./tools/self-critique.js";
import { UnifiedMemoryManager } from "./memory/manager.js";

export { SessionStore } from "./state/store.js";
export { SiloManager } from "./state/silo.js";
export { ToolCatalog } from "./registry/catalog.js";
export { TfIdfIndexer } from "./registry/indexer.js";
export { UnifiedMemoryManager } from "./memory/manager.js";
export type * from "./state/types.js";
export type * from "./registry/types.js";
export type * from "./memory/types.js";

export interface CreateServerOptions {
  /** Server name shown to MCP clients */
  name?: string;
  /** Server version */
  version?: string;
}

/**
 * Create a Context-First MCP server with all 34 tools registered.
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
  const memoryManager = new UnifiedMemoryManager();

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

  // ─── Unified Context Loop ───
  server.tool(
    "context_loop",
    "Run a complete context management cycle in one call. Orchestrates recap, conflict detection, ambiguity checking, entropy monitoring, abstention evaluation, depth quality analysis, grounding verification, temporal drift detection, and tool discovery into a unified pipeline. Returns a directive with: action (proceed/clarify/reset/abstain/deepen), machine-readable constraints, a context health score (0-1), grounding verdict, drift status, depth analysis, and auto-extracted ground-truth facts. Read the 'directive' field first — it tells you exactly what to do.",
    loopInputSchema.shape,
    async (input: LoopToolInput) => handleLoop(store, catalog, input)
  );

  // ─── SGI: Grounding Check (arXiv:2602.13224) ───
  server.tool(
    "check_grounding",
    "Verify whether the assistant's recent output is grounded in stored conversation facts. Uses a Semantic Grounding Index with three dimensions: factual overlap, context adherence, and falsifiability. Returns a grounding score (0-1) and lists ungrounded claims.",
    groundingInputSchema.shape,
    async (input: GroundingInput) => ({
      content: [{ type: "text" as const, text: JSON.stringify(handleGrounding(store, input), null, 2) }],
    })
  );

  // ─── TCA: Temporal Drift Detection (arXiv:2503.15560) ───
  server.tool(
    "detect_drift",
    "Track context health over time and detect degradation patterns. Identifies sudden shifts, gradual decay, and oscillation. Records health snapshots per turn and computes a progressive risk score. Risk ≥ 0.7 signals critical drift requiring intervention.",
    driftInputSchema.shape,
    async (input: DriftInput) => ({
      content: [{ type: "text" as const, text: JSON.stringify(handleDrift(input), null, 2) }],
    })
  );

  // ─── Depth Quality Monitor (arXiv:2512.20662 — Laziness Detection) ───
  server.tool(
    "check_depth",
    "Analyze assistant output for depth quality. Detects the LLM laziness pattern: broad coverage with shallow elaboration per section. Returns a depth score (0-1), identifies shallow sections, and generates specific elaboration directives. Use after generating long-form content to ensure each topic is deeply covered.",
    depthInputSchema.shape,
    async (input: DepthToolInput) => handleDepth(input)
  );

  // ─── Layer 3: Hierarchical Memory Management System (HMMS) ───

  // ─── MemMachine + LIGHT + MemGPT + HippoRAG + SimpleMem + HiMem + FluxMem + CogWS + ReMemR1 ───
  server.tool(
    "memory_store",
    "Store content into hierarchical memory system. Content flows through: sentence-level episode storage (MemMachine), knowledge graph (HippoRAG), 4-tier memory hierarchy (LIGHT/MemGPT), active curation (Cognitive Workspace), and callback registration (ReMemR1). Auto-compacts when consolidation threshold is reached.",
    memoryStoreInputSchema.shape,
    async (input: MemoryStoreInput) => handleMemoryStore(memoryManager, input)
  );

  server.tool(
    "memory_recall",
    "Retrieve relevant memories using FluxMem adaptive gate selection. Probabilistically queries the optimal combination of scratchpad, working memory, episodic index, semantic memory, knowledge graph, and callback memory based on query type and context signals. Returns ranked results with provenance.",
    memoryRecallInputSchema.shape,
    async (input: MemoryRecallInput) => handleMemoryRecall(memoryManager, input)
  );

  server.tool(
    "memory_compact",
    "Trigger memory compaction with integrity verification. Runs SimpleMem SSC (3-phase compression: dedup → structural → clustering), recursive consolidation into semantic memory, working memory eviction, and verifies <0.01% information loss via atomic fact verification.",
    memoryCompactInputSchema.shape,
    async (input: MemoryCompactInput) => handleMemoryCompact(memoryManager, input)
  );

  server.tool(
    "memory_graph",
    "Query or manage the HippoRAG-inspired knowledge graph. Supports associative recall via BFS with PageRank weighting, graph statistics with top entities, and PageRank recomputation.",
    memoryGraphInputSchema.shape,
    async (input: MemoryGraphInput) => handleMemoryGraph(memoryManager, input)
  );

  server.tool(
    "memory_inspect",
    "Inspect memory tier status. View individual tiers (scratchpad, working, episodic, semantic, graph, curation, callbacks) or get a comprehensive status overview across all tiers. Optionally run integrity verification.",
    memoryInspectInputSchema.shape,
    async (input: MemoryInspectInput) => handleMemoryInspect(memoryManager, input)
  );

  server.tool(
    "memory_curate",
    "Active memory curation powered by Cognitive Workspace approach. Get top-importance entries, filter by auto-detected domain tags, find most-reused memories, or prune low-importance entries.",
    memoryCurateInputSchema.shape,
    async (input: MemoryCurateInput) => handleMemoryCurate(memoryManager, input)
  );

  // ─── Layer 4: Advanced Reasoning Paradigms ───

  // ─── InftyThink: Iterative Bounded Reasoning (2025) ───
  server.tool(
    "inftythink_reason",
    "Run iterative bounded-segment reasoning using InftyThink. Breaks complex problems into bounded reasoning segments with sawtooth summarization. Detects convergence automatically. Use for problems that benefit from iterative approach with progressive refinement.",
    inftythinkInputSchema.shape,
    async (input: InftyThinkToolInput) => handleInftyThink(input)
  );

  // ─── Coconut: Continuous Thought in Latent Space (2025) ───
  server.tool(
    "coconut_reason",
    "Reason in a continuous latent space using Coconut (Chain of Continuous Thought). Encodes the problem into a latent vector and iteratively transforms it through simulated multi-head attention and feed-forward layers. Decodes when confidence threshold is reached. Use for tasks requiring breadth-first exploration or planning.",
    coconutInputSchema.shape,
    async (input: CoconutToolInput) => handleCoconut(input)
  );

  // ─── Extra-CoT: Extreme Token Compression (2025) ───
  server.tool(
    "extracot_compress",
    "Compress verbose reasoning chains using Extra-CoT extreme compression. Applies 4-phase pipeline: deduplication, filler removal, compact pattern substitution, and sentence-level compression. Maintains semantic fidelity above a configurable floor. Use after generating reasoning chains to reduce token usage.",
    extracotInputSchema.shape,
    async (input: ExtraCoTToolInput) => handleExtraCoT(input)
  );

  // ─── Mind Evolution: Evolutionary Search (2025) ───
  server.tool(
    "mindevolution_solve",
    "Solve problems through evolutionary search over candidate solutions using Mind Evolution. Initializes a diverse population (analytical, creative, systematic, critical, concise, comprehensive), then evolves through selection, crossover, mutation, and refinement. Use for open-ended problems with multiple viable approaches.",
    mindevolutionInputSchema.shape,
    async (input: MindEvolutionToolInput) => handleMindEvolution(input)
  );

  // ─── KAG-Thinker: Structured Interactive Thinking (2025) ───
  server.tool(
    "kagthinker_solve",
    "Decompose and solve complex problems using KAG-Thinker structured interactive thinking. Creates logical forms from the problem, builds a dependency graph, resolves in topological order through interactive steps, and verifies against known facts. Use for problems requiring structured decomposition and rigorous resolution.",
    kagthinkerInputSchema.shape,
    async (input: KAGThinkerToolInput) => handleKAGThinker(input)
  );

  // ─── Layer 5: Truthfulness & Self-Verification ───

  // ─── Internal State Probing (arXiv:2304.13734 — "The Internal State of an LLM Knows When It's Lying") ───
  server.tool(
    "probe_internal_state",
    "Probe assistant output for internal state signals that correlate with truthfulness. Uses 5 proxy activation methods: assertion strength, epistemic certainty, factual alignment, hedging density, and self-consistency. Classifies each claim as likely_true, uncertain, or likely_false. Inspired by research showing LLM internal representations contain truthfulness signals.",
    internalStateInputSchema.shape,
    async (input: InternalStateInput) => handleInternalState(store, input)
  );

  // ─── Truth Direction Analysis (arXiv:2310.15916 — "Consistency and Generalization of Truth Directions") ───
  server.tool(
    "detect_truth_direction",
    "Analyze truth direction consistency across claims in assistant output. Computes a 4-feature truth vector (factConsistency, linguisticConfidence, logicalCoherence, sourceAttribution) and projects each claim onto it. Detects deviant claims that diverge from the dominant truth direction. Based on research showing truth has a consistent linear direction in LLM representation space.",
    truthDirectionInputSchema.shape,
    async (input: TruthDirectionInput) => handleTruthDirection(store, input)
  );

  // ─── Neighborhood Consistency Belief (arXiv:2502.12345 — "Illusions of Confidence?") ───
  server.tool(
    "ncb_check",
    "Test response robustness through Neighbor-Consistency Belief measurement. Generates 5 perturbation types (paraphrase, implication, negation, thematic_shift, specificity_change), evaluates consistency under each, and computes a weighted NCB score. Distinguishes genuinely confident knowledge from surface-level pattern matching. Verdict: robust, brittle, or mixed.",
    neighborhoodInputSchema.shape,
    async (input: NeighborhoodInput) => handleNeighborhood(store, input)
  );

  // ─── Logical Consistency Under Transformations (SELFCHECKGPT + Chain-of-Verification) ───
  server.tool(
    "check_logical_consistency",
    "Check logical consistency of claims under formal transformations: negation, conjunction, modus ponens, transitivity, and direct consistency checks. Detects contradictions, circular reasoning, and logical violations. Returns trust level (high/medium/low) with detailed transformation results and contradiction explanations.",
    logicalConsistencyInputSchema.shape,
    async (input: LogicalConsistencyInput) => handleLogicalConsistency(store, input)
  );

  // ─── Verify-First Strategy (arXiv:2309.11495 — Chain-of-Verification, Meta 2023) ───
  server.tool(
    "verify_first",
    "Apply verification-first strategy before accepting candidate answers. Evaluates across 5 weighted dimensions: factual grounding (0.25), internal consistency (0.25), completeness (0.20), specificity (0.15), and source coherence (0.15). Generates verification questions per claim. Recommends accept (≥0.75), revise (≥0.45), or reject, with revision suggestions.",
    verifyFirstInputSchema.shape,
    async (input: VerifyFirstInput) => handleVerifyFirst(store, input)
  );

  // ─── IoE Self-Correction (Intrinsic Self-Evaluation — "If-or-Else" Confidence Strategy) ───
  server.tool(
    "ioe_self_correct",
    "Apply If-or-Else confidence-based self-correction. Assesses response confidence across 5 metrics (linguistic confidence, factual risk, ground truth alignment, self-consistency, question relevance). Only corrects when confidence is low (< 0.4) to avoid over-correction. Escalates after 2+ failed attempts. Returns action: accept, correct, or escalate.",
    ioeSelfCorrectInputSchema.shape,
    async (input: IoeSelfCorrectInput) => handleIoeSelfCorrect(store, input)
  );

  // ─── Iterative Self-Critique (Self-Refine + Constitutional AI) ───
  server.tool(
    "self_critique",
    "Run iterative self-critique and refinement cycles on a solution. Evaluates against configurable criteria (default: accuracy, completeness, clarity, consistency, relevance) through multiple rounds. Simulates refinement between iterations and detects convergence when improvement plateaus (delta < 0.05). Returns per-iteration scores, critiques, convergence status, and improvement over initial.",
    selfCritiqueInputSchema.shape,
    async (input: SelfCritiqueInput) => handleSelfCritique(store, input)
  );

  // ─── Self-Register All 34 Tools in Catalog ───
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
    {
      name: "context_loop",
      description: "Run a complete context management cycle in one call. Returns an LLM directive with action, machine-readable constraints, context health score, grounding verdict, drift status, and auto-extracted facts.",
      inputSchema: loopInputSchema.shape,
      tags: ["loop", "unified", "orchestration", "pipeline", "meta", "context-cycle", "directive", "grounding", "drift"],
    },
    {
      name: "check_grounding",
      description: "Verify whether assistant output is grounded in stored conversation facts using a Semantic Grounding Index.",
      inputSchema: groundingInputSchema.shape,
      tags: ["grounding", "hallucination", "factual", "verification", "sgi"],
    },
    {
      name: "detect_drift",
      description: "Track context health over time and detect degradation patterns: sudden shifts, gradual decay, oscillation.",
      inputSchema: driftInputSchema.shape,
      tags: ["drift", "temporal", "health", "trend", "monitoring", "tca"],
    },
    {
      name: "check_depth",
      description: "Analyze assistant output for depth quality. Detects LLM laziness pattern: broad coverage with shallow elaboration.",
      inputSchema: depthInputSchema.shape,
      tags: ["depth", "laziness", "quality", "elaboration", "research", "detail"],
    },
    {
      name: "memory_store",
      description: "Store content into hierarchical memory system with sentence-level episode storage, knowledge graph, 4-tier hierarchy, curation, and callbacks.",
      inputSchema: memoryStoreInputSchema.shape,
      tags: ["memory", "store", "episode", "ingest", "hierarchical"],
    },
    {
      name: "memory_recall",
      description: "Retrieve relevant memories using FluxMem adaptive gate selection across all memory structures.",
      inputSchema: memoryRecallInputSchema.shape,
      tags: ["memory", "recall", "retrieve", "search", "gate", "fluxmem"],
    },
    {
      name: "memory_compact",
      description: "Trigger memory compaction with integrity verification. Compresses via SimpleMem SSC and verifies <0.01% loss.",
      inputSchema: memoryCompactInputSchema.shape,
      tags: ["memory", "compact", "compress", "integrity", "simplemem"],
    },
    {
      name: "memory_graph",
      description: "Query or manage HippoRAG-inspired knowledge graph with PageRank scoring and associative recall.",
      inputSchema: memoryGraphInputSchema.shape,
      tags: ["memory", "graph", "pagerank", "entity", "relation", "hipporag"],
    },
    {
      name: "memory_inspect",
      description: "Inspect memory tier status across scratchpad, working, episodic, semantic, graph, curation, and callbacks.",
      inputSchema: memoryInspectInputSchema.shape,
      tags: ["memory", "inspect", "status", "tiers", "monitoring"],
    },
    {
      name: "memory_curate",
      description: "Active memory curation: get top entries, filter by domain tags, find most-reused, or prune low-importance.",
      inputSchema: memoryCurateInputSchema.shape,
      tags: ["memory", "curate", "importance", "tags", "prune", "cognitive"],
    },
    {
      name: "inftythink_reason",
      description: "Iterative bounded-segment reasoning with sawtooth summarization and convergence detection.",
      inputSchema: inftythinkInputSchema.shape,
      tags: ["reasoning", "iterative", "inftythink", "segments", "convergence", "summarization"],
    },
    {
      name: "coconut_reason",
      description: "Continuous thought reasoning in latent space. Simulates multi-head attention and feed-forward layers for breadth-first exploration.",
      inputSchema: coconutInputSchema.shape,
      tags: ["reasoning", "latent", "coconut", "continuous", "planning", "breadth-first"],
    },
    {
      name: "extracot_compress",
      description: "Extreme token compression for reasoning chains. 4-phase pipeline preserving semantic fidelity above configurable floor.",
      inputSchema: extracotInputSchema.shape,
      tags: ["reasoning", "compression", "extracot", "tokens", "fidelity", "optimization"],
    },
    {
      name: "mindevolution_solve",
      description: "Evolutionary search over diverse candidate solutions with selection, crossover, mutation, and refinement.",
      inputSchema: mindevolutionInputSchema.shape,
      tags: ["reasoning", "evolution", "search", "population", "genetic", "optimization"],
    },
    {
      name: "kagthinker_solve",
      description: "Structured interactive thinking with logical form decomposition, dependency graph resolution, and fact grounding.",
      inputSchema: kagthinkerInputSchema.shape,
      tags: ["reasoning", "structured", "kagthinker", "logical", "decomposition", "interactive"],
    },
    {
      name: "probe_internal_state",
      description: "Probe assistant output for internal state signals correlating with truthfulness. 5 proxy activation methods classify claims as likely_true, uncertain, or likely_false.",
      inputSchema: internalStateInputSchema.shape,
      tags: ["truthfulness", "internal-state", "activation", "probing", "lying-detection", "layer5"],
    },
    {
      name: "detect_truth_direction",
      description: "Analyze truth direction consistency across claims. Computes 4-feature truth vector, detects deviant claims diverging from dominant truth direction.",
      inputSchema: truthDirectionInputSchema.shape,
      tags: ["truthfulness", "truth-direction", "consistency", "claims", "alignment", "layer5"],
    },
    {
      name: "ncb_check",
      description: "Neighbor-Consistency Belief measurement through 5 perturbation types. Distinguishes genuine knowledge from surface pattern matching.",
      inputSchema: neighborhoodInputSchema.shape,
      tags: ["truthfulness", "neighborhood", "consistency", "perturbation", "robustness", "layer5"],
    },
    {
      name: "check_logical_consistency",
      description: "Check logical consistency under formal transformations: negation, conjunction, modus ponens, transitivity. Detects contradictions and circular reasoning.",
      inputSchema: logicalConsistencyInputSchema.shape,
      tags: ["truthfulness", "logical", "consistency", "contradiction", "formal", "layer5"],
    },
    {
      name: "verify_first",
      description: "Verification-first strategy evaluating across 5 weighted dimensions before accepting answers. Recommends accept, revise, or reject.",
      inputSchema: verifyFirstInputSchema.shape,
      tags: ["truthfulness", "verification", "cove", "chain-of-verification", "layer5"],
    },
    {
      name: "ioe_self_correct",
      description: "If-or-Else confidence-based self-correction. Only corrects when confidence is low to avoid over-correction. Escalates after repeated failures.",
      inputSchema: ioeSelfCorrectInputSchema.shape,
      tags: ["truthfulness", "self-correction", "confidence", "ioe", "conditional", "layer5"],
    },
    {
      name: "self_critique",
      description: "Iterative self-critique with multi-round evaluation, convergence detection, and refinement simulation across configurable criteria.",
      inputSchema: selfCritiqueInputSchema.shape,
      tags: ["truthfulness", "self-critique", "refinement", "iterative", "convergence", "layer5"],
    },
  ]);

  return { server, store, siloManager, catalog, memoryManager };
}
