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
import {
  researchPipelineInputSchema,
  handleResearchPipeline,
  exportResearchFilesInputSchema,
  handleExportResearchFiles,
  type ResearchPipelineInput,
  type ExportResearchFilesInput,
} from "./tools/research-pipeline.js";
import { UnifiedMemoryManager } from "./memory/manager.js";
import { recordToolCallAndCheckFreshness, getLoopFreshness } from "./engine/loop-freshness.js";

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

// ─── Server Instructions (injected into LLM context during MCP initialize) ───

const CONTEXT_FIRST_INSTRUCTIONS = `## Context-First MCP — Usage Protocol

You have access to the Context-First MCP server. Follow this protocol strictly:

### MANDATORY: context_loop is your primary tool
- Call \`context_loop\` BEFORE starting any complex task (research, multi-step workflows, long-form generation)
- Call \`context_loop\` every 2-3 tool calls or conversation turns during ongoing work
- Call \`context_loop\` AFTER generating any long-form output to check depth and quality
- ALWAYS read and follow the \`directive.action\` in the response (proceed/clarify/reset/abstain/deepen/verify)

### When directive.action = "deepen"
Your output was detected as shallow. You MUST re-elaborate the flagged sections with specific examples, data, evidence, and analysis BEFORE moving on. Do NOT skip this.

### When directive.action = "verify"
Claims in your output may be false. You MUST verify flagged claims against sources before presenting them.

### Memory Preservation
- Use \`memory_store\` to save important research findings, decisions, and facts
- Use \`memory_recall\` to retrieve relevant previous findings before generating new content
- Use \`memory_compact\` when memory grows large

### Call Frequency Guide
- Research tasks: context_loop at start → every 2 searches → after draft → before final
- Multi-step tasks: context_loop at start → after each major step
- Long conversations: context_loop every 3 turns minimum

### RECOMMENDED: research_pipeline for research tasks
For any research, analysis, or deep investigation task, use \`research_pipeline\` instead of calling individual tools.
It auto-chains all 34 underlying Context-First tool-equivalents across 5 phases:
  1. \`init\` — context_loop (17 stages) + memory_recall + state check + discover_tools
  2. \`gather\` — memory_store + knowledge_graph + context_loop health check + AUTONOMOUS FILE WRITE (call per search)
  3. \`analyze\` — quarantine sandbox + inftythink + coconut + kagthinker + mindevolution + extracot + memory + context_loop
  4. \`verify\` — context_loop (strict thresholds) + memory cross-check + memory inspect + verification persistence
  5. \`finalize\` — memory_store + compact + graph + curate + inspect + history summary + export manifest/chunk retrieval + context_loop

This guarantees the internal Context-First workflow runs in order and now returns a batch-preserving export manifest during \`finalize\`. It still does NOT fetch external sources on its own, so you need to gather or supply evidence during \`gather\` from web search, GitHub search, fetch tools, or any other MCP you use.

**CRITICAL WORKFLOW — Interleave search and gather:**
  - Do ONE web search → IMMEDIATELY call gather → file written to disk → repeat for next topic
  - Do NOT batch multiple searches before calling gather — context compaction will lose earlier results
  - You are a research AUTHOR in gather: write comprehensive sections with facts, data, analysis, and expert commentary
  - Each gather call writes one file to disk — this is the pipeline’s core output
  - After all topics gathered: analyze → verify → finalize (these operate on accumulated files/memory)

**Autonomous file writing** (ALWAYS ON): The pipeline automatically writes files to disk during each phase. If you provide \`outputDir\`, files go there; otherwise a temp directory is auto-created (reported in init directive). Optionally set \`baseFileName\` (default "research"):
  - **gather**: writes \`{base}.batch-{N}.{topic}.md\` — ONE cohesive file per gather call (all headings preserved inside). Only splits into multiple files if a single gather exceeds 30K chars.
  - **analyze**: writes \`{base}.analysis.md\` — synthesized reasoning from all 5 engines
  - **finalize**: writes \`{base}.final-{N}.{chunk}.md\` per enriched chunk + \`{base}.synthesis.md\` (master report)
Files accumulate on disk across phases, surviving context compaction. Each phase's directive reports what files were written and where.
You do NOT need to write files yourself — the pipeline does it. Finalize runs even if verify hasn't passed (with a warning). You can optionally call \`export_research_files\` with exportRawEvidence=true for additional raw evidence backup.

### Do NOT
- Generate long research reports without calling context_loop first and after
- Rely solely on other MCPs for memory when context-first memory tools are available
- Ignore directive actions — they are instructions, not suggestions
- Assume research_pipeline replaces evidence gathering — it preserves, pressure-tests, and verifies sourced findings
- Use individual tools for research tasks when research_pipeline can orchestrate them all

### Tool Naming Convention
All tool names use UNDERSCORES, not hyphens: memory_store, memory_recall, memory_compact, memory_graph, memory_inspect, memory_curate, context_loop, etc.

### Tool Categories (37 tools total)
- [ORCHESTRATOR]: context_loop — call this FIRST and every 2-3 turns
- [CONTEXT HEALTH]: recap_conversation, detect_conflicts, check_ambiguity, verify_execution, entropy_monitor, abstention_check, check_grounding, detect_drift, check_depth
- [STATE]: get_state, set_state, clear_state, get_history_summary
- [MEMORY]: memory_store, memory_recall, memory_compact, memory_graph, memory_inspect, memory_curate
- [SANDBOX]: discover_tools, quarantine_context, merge_quarantine
- [REASONING]: inftythink_reason, coconut_reason, extracot_compress, mindevolution_solve, kagthinker_solve
- [TRUTHFULNESS]: probe_internal_state, detect_truth_direction, ncb_check, check_logical_consistency, verify_first, ioe_self_correct, self_critique
- [PIPELINE]: research_pipeline — structured research orchestration with outline planning, quality gates, coverage tracking, and review tests (6 phases)
- [EXPORT]: export_research_files — automatically writes verified report chunks and/or raw evidence batches to disk

### Research Task Quick Reference
PREFERRED: Call research_pipeline with phase=init → then INTERLEAVE: (web search → gather) ×N → review → (fix gathers) → analyze → verify → finalize.
CRITICAL: After EACH web search, IMMEDIATELY call gather. Do NOT batch searches. Write deeply in each gather call — quality gate enforces 25K char / 500 line minimum per section — multiple gathers per section accumulate depth.
NEW: plan→draft→review→fix loop — like compile→test→fix in coding. Init generates a research outline. Each gather drafts one section. Call review to run quality tests. Fix failed sections with targeted re-gathers. Coverage must reach 60% before analyze.
The pipeline AUTOMATICALLY writes files to disk during gather, analyze, and finalize phases — no manual file creation needed. Files go to the outputDir you provide, or an auto-generated temp directory (reported in init). Finalize works even if verify hasn't passed (with a warning).
This auto-chains all 34 underlying Context-First tool-equivalents across 6 phases. It does not fetch sources on its own, so pass sourced content into gather from web, GitHub, fetch, or other MCP tools. If you need individual tools instead:
Phase 1: context_loop → memory_recall (check prior knowledge)
Phase 2: (2-3 searches) → memory_store (save findings) → context_loop (check health)
Phase 3: Generate → context_loop (depth/truth check) → fix flagged sections
Phase 4: context_loop (verify) → memory_store (save) → memory_compact`;

/**
 * Wrap a tool handler to inject loop freshness reminders.
 * Extracts sessionId from the input and checks if context_loop is stale.
 * Appends a reminder text block to the response if stale.
 */
function withLoopReminder<T extends Record<string, unknown>>(
  handler: (input: T) => { content: Array<{ type: "text"; text: string }> } | Promise<{ content: Array<{ type: "text"; text: string }> }>
): (input: T) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return async (input: T) => {
    const result = await handler(input);
    const sessionId = (input as { sessionId?: string }).sessionId ?? "default";
    const reminder = recordToolCallAndCheckFreshness(sessionId);
    if (reminder) {
      result.content.push({
        type: "text" as const,
        text: reminder,
      });
    }
    return result;
  };
}

/**
 * Bootstrap enforcement gate — blocks non-loop tools until context_loop
 * has been called at least once in the session. Prevents the chicken-and-egg
 * problem where withLoopReminder only fires after a CF tool is already called.
 */
function withBootstrapGate<T extends Record<string, unknown>>(
  toolName: string,
  handler: (input: T) => { content: Array<{ type: "text"; text: string }> } | Promise<{ content: Array<{ type: "text"; text: string }> }>
): (input: T) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return async (input: T) => {
    const sessionId = (input as { sessionId?: string }).sessionId ?? "default";
    const freshness = getLoopFreshness(sessionId);

    if (!freshness.everCalled) {
      // Don't hard-block — execute the tool but prepend a strong redirect
      const result = await handler(input);
      result.content.unshift({
        type: "text" as const,
        text: `⚠️ REQUIRED: You have not called context_loop yet this session. ` +
          `Call context_loop IMMEDIATELY before making any more tool calls. ` +
          `It initializes context health tracking, detects contradictions, checks depth, and tells you exactly what to do next.\n` +
          `Minimal call: context_loop({ "messages": [{"role":"user","content":"<current task>","turn":1}] })\n` +
          `─────────────────────────────────────────`,
      });
      return result;
    }

    return handler(input);
  };
}

/**
 * Create a Context-First MCP server with all 37 tools registered.
 * Returns the McpServer instance and the SessionStore for lifecycle management.
 */
export function createContextFirstServer(options: CreateServerOptions = {}) {
  const {
    name = "context-first-mcp",
    version = "1.0.0",
  } = options;

  const server = new McpServer(
    { name, version },
    {
      instructions: CONTEXT_FIRST_INSTRUCTIONS,
    }
  );

  const store = new SessionStore();
  const siloManager = new SiloManager(store);
  const catalog = new ToolCatalog();
  const memoryManager = new UnifiedMemoryManager();

  // ─── Gap 1: Lost in Conversation ───
  server.tool(
    "recap_conversation",
    "[CONTEXT HEALTH] Analyze conversation history, identify hidden intents, and produce a consolidated state summary. Run every 2-3 turns to prevent context degradation. TIP: context_loop does this AND more — prefer calling context_loop instead.",
    recapInputSchema.shape,
    withBootstrapGate("recap_conversation", withLoopReminder((input: RecapInput) => handleRecap(store, input)))
  );

  // ─── Gap 2: Context Clash ───
  server.tool(
    "detect_conflicts",
    "[CONTEXT HEALTH] Compare new user input against established conversation ground truth. Detects contradictions, changed requirements, and shifted assumptions. TIP: context_loop runs this automatically — prefer context_loop for comprehensive checks.",
    conflictInputSchema.shape,
    withBootstrapGate("detect_conflicts", withLoopReminder((input: ConflictInput) => handleConflict(store, input)))
  );

  // ─── Gap 3: Calibration & Trust ───
  server.tool(
    "check_ambiguity",
    "[CONTEXT HEALTH] Analyze a requirement or instruction for underspecification. Returns clarifying questions that should be asked before proceeding. TIP: context_loop runs ambiguity checks automatically.",
    ambiguityInputSchema.shape,
    withBootstrapGate("check_ambiguity", withLoopReminder((input: AmbiguityInput) => handleAmbiguity(input)))
  );

  // ─── Gap 4: Benchmark vs Reality ───
  server.tool(
    "verify_execution",
    "[CONTEXT HEALTH] Validate that a tool output or action actually achieved its stated goal. Checks for common failure modes like silent errors, partial completion, and wrong-target execution.",
    verifyInputSchema.shape,
    withBootstrapGate("verify_execution", async (input: VerifyInput) => handleVerify(input))
  );

  // ─── State Management ───
  server.tool(
    "get_state",
    "[STATE] Retrieve the current conversation ground truth — confirmed facts, decisions, and task status.",
    getStateInputSchema.shape,
    withBootstrapGate("get_state", async (input: GetStateInput) => handleGetState(store, input))
  );

  server.tool(
    "set_state",
    "[STATE] Lock in a confirmed fact or decision to the conversation ground truth.",
    setStateInputSchema.shape,
    withBootstrapGate("set_state", async (input: SetStateInput) => handleSetState(store, input))
  );

  server.tool(
    "clear_state",
    "[STATE] Remove specific keys or reset the entire conversation ground truth.",
    clearStateInputSchema.shape,
    withBootstrapGate("clear_state", async (input: ClearStateInput) => handleClearState(store, input))
  );

  server.tool(
    "get_history_summary",
    "[STATE] Get a compressed conversation history with intent annotations and key decision points highlighted.",
    historyInputSchema.shape,
    withBootstrapGate("get_history_summary", async (input: HistoryInput) => handleHistory(store, input))
  );

  // ─── Layer 2: Research-Backed Tools ───

  // ─── MCP-Zero: Tool Discovery ───
  server.tool(
    "discover_tools",
    "[SANDBOX] Semantically search for available tools by capability description. Uses TF-IDF indexing to match natural language queries to tool descriptions.",
    discoverInputSchema.shape,
    withBootstrapGate("discover_tools", async (input: DiscoverInput) => handleDiscover(catalog, input))
  );

  // ─── Multi-Agent Quarantine ───
  server.tool(
    "quarantine_context",
    "[SANDBOX] Create an isolated state sandbox (silo) for exploratory or multi-agent workflows. Optionally inherit selected keys from the parent session.",
    quarantineInputSchema.shape,
    withBootstrapGate("quarantine_context", async (input: QuarantineInput) => handleQuarantine(siloManager, input))
  );

  server.tool(
    "merge_quarantine",
    "[SANDBOX] Merge or discard a quarantine silo. On merge, promoted keys are written back to the parent session ground truth.",
    mergeQuarantineInputSchema.shape,
    withBootstrapGate("merge_quarantine", async (input: MergeQuarantineInput) =>
      handleMergeQuarantine(siloManager, input))
  );

  // ─── ERGO: Entropy Monitoring ───
  server.tool(
    "entropy_monitor",
    "[CONTEXT HEALTH] Compute proxy entropy metrics from recent LLM outputs. Detects hedging, repetition, contradictions, and lexical degradation. Optionally auto-resets context on spike. TIP: context_loop monitors entropy automatically — prefer context_loop.",
    entropyInputSchema.shape,
    withBootstrapGate("entropy_monitor", withLoopReminder((input: EntropyInput) => handleEntropy(store, input)))
  );

  // ─── RLAAR: Abstention Check ───
  server.tool(
    "abstention_check",
    "[CONTEXT HEALTH] Evaluate confidence across 5 dimensions to decide if the system should abstain from answering. Checks state completeness, recency, contradictions, ambiguity, and source quality. TIP: context_loop includes abstention analysis automatically.",
    abstentionInputSchema.shape,
    withBootstrapGate("abstention_check", withLoopReminder((input: AbstentionInput) => handleAbstention(store, input)))
  );

  // ─── Unified Context Loop ───
  server.tool(
    "context_loop",
    `[ORCHESTRATOR — CALL THIS FIRST] CALL THIS TOOL every 2-3 turns and at the start of ANY task. It is the single most important tool — it replaces calling recap, conflict, ambiguity, entropy, grounding, drift, depth, and discovery tools individually.

What it does: Runs ALL context health checks in one call. Auto-extracts facts from conversation, detects contradictions, checks answer quality, and tells you exactly what to do next.

Returns a 'directive' object with:
- action: proceed | clarify | reset | abstain | deepen | verify
- instruction: Plain English telling you what to do
- contextHealth: 0-1 score
- autoExtractedFacts: Key facts pulled from conversation
- suggestedNextTools: What tools to call next
- constraints: Machine-readable rules you must follow

ESSENTIAL for: research tasks, multi-step workflows, long conversations, preserving context across turns, knowledge management, and any task requiring memory or fact-checking.

Minimal call: { "messages": [{"role":"user","content":"<user msg>","turn":1}] } — most fields have smart defaults.`,
    loopInputSchema.shape,
    async (input: LoopToolInput) => handleLoop(store, catalog, input)
  );

  // ─── SGI: Grounding Check (arXiv:2602.13224) ───
  server.tool(
    "check_grounding",
    "[CONTEXT HEALTH] Verify whether the assistant's recent output is grounded in stored conversation facts. Uses a Semantic Grounding Index with three dimensions: factual overlap, context adherence, and falsifiability. Returns a grounding score (0-1) and lists ungrounded claims. TIP: context_loop runs grounding checks automatically.",
    groundingInputSchema.shape,
    withBootstrapGate("check_grounding", withLoopReminder((input: GroundingInput) => ({
      content: [{ type: "text" as const, text: JSON.stringify(handleGrounding(store, input), null, 2) }],
    })))
  );

  // ─── TCA: Temporal Drift Detection (arXiv:2503.15560) ───
  server.tool(
    "detect_drift",
    "[CONTEXT HEALTH] Track context health over time and detect degradation patterns. Identifies sudden shifts, gradual decay, and oscillation. Records health snapshots per turn and computes a progressive risk score. Risk ≥ 0.7 signals critical drift requiring intervention. TIP: context_loop monitors drift automatically.",
    driftInputSchema.shape,
    withBootstrapGate("detect_drift", withLoopReminder((input: DriftInput) => ({
      content: [{ type: "text" as const, text: JSON.stringify(handleDrift(input), null, 2) }],
    })))
  );

  // ─── Depth Quality Monitor (arXiv:2512.20662 — Laziness Detection) ───
  server.tool(
    "check_depth",
    "[CONTEXT HEALTH] Analyze assistant output for depth quality. Detects the LLM laziness pattern: broad coverage with shallow elaboration per section. Returns a depth score (0-1), identifies shallow sections, and generates specific elaboration directives. TIP: context_loop runs depth checks automatically — prefer context_loop for holistic quality analysis.",
    depthInputSchema.shape,
    withBootstrapGate("check_depth", withLoopReminder((input: DepthToolInput) => handleDepth(input)))
  );

  // ─── Layer 3: Hierarchical Memory Management System (HMMS) ───

  // ─── MemMachine + LIGHT + MemGPT + HippoRAG + SimpleMem + HiMem + FluxMem + CogWS + ReMemR1 ───
  server.tool(
    "memory_store",
    "[MEMORY] Store content into hierarchical memory system. TOOL NAME: memory_store (use underscores, NOT hyphens). Content flows through: sentence-level episode storage, knowledge graph, 4-tier memory hierarchy, active curation, and callback registration. Auto-compacts when consolidation threshold is reached. Remember to call context_loop periodically to maintain context health.",
    memoryStoreInputSchema.shape,
    withBootstrapGate("memory_store", withLoopReminder((input: MemoryStoreInput) => handleMemoryStore(memoryManager, input)))
  );

  server.tool(
    "memory_recall",
    "[MEMORY] Retrieve relevant memories using adaptive gate selection. TOOL NAME: memory_recall (underscores). Probabilistically queries the optimal combination of scratchpad, working memory, episodic index, semantic memory, knowledge graph, and callback memory based on query type and context signals. Returns ranked results with provenance. Remember to call context_loop periodically to maintain context health.",
    memoryRecallInputSchema.shape,
    withBootstrapGate("memory_recall", withLoopReminder((input: MemoryRecallInput) => handleMemoryRecall(memoryManager, input)))
  );

  server.tool(
    "memory_compact",
    "[MEMORY] Trigger memory compaction with integrity verification. TOOL NAME: memory_compact (underscores). Runs 3-phase compression: dedup → structural → clustering, recursive consolidation into semantic memory, working memory eviction, and verifies <0.01% information loss via atomic fact verification.",
    memoryCompactInputSchema.shape,
    withBootstrapGate("memory_compact", withLoopReminder((input: MemoryCompactInput) => handleMemoryCompact(memoryManager, input)))
  );

  server.tool(
    "memory_graph",
    "[MEMORY] Query or manage the knowledge graph. TOOL NAME: memory_graph (underscores). Supports associative recall via BFS with PageRank weighting, graph statistics with top entities, and PageRank recomputation.",
    memoryGraphInputSchema.shape,
    withBootstrapGate("memory_graph", withLoopReminder((input: MemoryGraphInput) => handleMemoryGraph(memoryManager, input)))
  );

  server.tool(
    "memory_inspect",
    "[MEMORY] Inspect memory tier status. TOOL NAME: memory_inspect (underscores). View individual tiers (scratchpad, working, episodic, semantic, graph, curation, callbacks) or get a comprehensive status overview across all tiers. Optionally run integrity verification.",
    memoryInspectInputSchema.shape,
    withBootstrapGate("memory_inspect", withLoopReminder((input: MemoryInspectInput) => handleMemoryInspect(memoryManager, input)))
  );

  server.tool(
    "memory_curate",
    "[MEMORY] Active memory curation. TOOL NAME: memory_curate (underscores). Get top-importance entries, filter by auto-detected domain tags, find most-reused memories, or prune low-importance entries.",
    memoryCurateInputSchema.shape,
    withBootstrapGate("memory_curate", withLoopReminder((input: MemoryCurateInput) => handleMemoryCurate(memoryManager, input)))
  );

  // ─── Layer 4: Advanced Reasoning Paradigms ───

  // ─── InftyThink: Iterative Bounded Reasoning (2025) ───
  server.tool(
    "inftythink_reason",
    "[REASONING] Run iterative bounded-segment reasoning. Breaks complex problems into bounded reasoning segments with sawtooth summarization. Detects convergence automatically. Use for problems that benefit from iterative approach with progressive refinement.",
    inftythinkInputSchema.shape,
    withBootstrapGate("inftythink_reason", async (input: InftyThinkToolInput) => handleInftyThink(input))
  );

  // ─── Coconut: Continuous Thought in Latent Space (2025) ───
  server.tool(
    "coconut_reason",
    "[REASONING] Reason in a continuous latent space. Encodes the problem into a latent vector and iteratively transforms it through simulated multi-head attention and feed-forward layers. Decodes when confidence threshold is reached. Use for tasks requiring breadth-first exploration or planning.",
    coconutInputSchema.shape,
    withBootstrapGate("coconut_reason", async (input: CoconutToolInput) => handleCoconut(input))
  );

  // ─── Extra-CoT: Extreme Token Compression (2025) ───
  server.tool(
    "extracot_compress",
    "[REASONING] Compress verbose reasoning chains using extreme compression. Applies 4-phase pipeline: deduplication, filler removal, compact pattern substitution, and sentence-level compression. Maintains semantic fidelity above a configurable floor. Use after generating reasoning chains to reduce token usage.",
    extracotInputSchema.shape,
    withBootstrapGate("extracot_compress", async (input: ExtraCoTToolInput) => handleExtraCoT(input))
  );

  // ─── Mind Evolution: Evolutionary Search (2025) ───
  server.tool(
    "mindevolution_solve",
    "[REASONING] Solve problems through evolutionary search over candidate solutions. Initializes a diverse population (analytical, creative, systematic, critical, concise, comprehensive), then evolves through selection, crossover, mutation, and refinement. Use for open-ended problems with multiple viable approaches.",
    mindevolutionInputSchema.shape,
    withBootstrapGate("mindevolution_solve", async (input: MindEvolutionToolInput) => handleMindEvolution(input))
  );

  // ─── KAG-Thinker: Structured Interactive Thinking (2025) ───
  server.tool(
    "kagthinker_solve",
    "[REASONING] Decompose and solve complex problems using structured interactive thinking. Creates logical forms from the problem, builds a dependency graph, resolves in topological order through interactive steps, and verifies against known facts. Use for problems requiring structured decomposition and rigorous resolution.",
    kagthinkerInputSchema.shape,
    withBootstrapGate("kagthinker_solve", async (input: KAGThinkerToolInput) => handleKAGThinker(input))
  );

  // ─── Layer 5: Truthfulness & Self-Verification ───

  // ─── Internal State Probing (arXiv:2304.13734 — "The Internal State of an LLM Knows When It's Lying") ───
  server.tool(
    "probe_internal_state",
    "[TRUTHFULNESS] Check if claims are likely true or false. Uses 5 proxy activation methods: assertion strength, epistemic certainty, factual alignment, hedging density, and self-consistency. Classifies each claim as likely_true, uncertain, or likely_false. Use when you need to verify truthfulness of generated content.",
    internalStateInputSchema.shape,
    withBootstrapGate("probe_internal_state", async (input: InternalStateInput) => handleInternalState(store, input))
  );

  // ─── Truth Direction Analysis (arXiv:2310.15916 — "Consistency and Generalization of Truth Directions") ───
  server.tool(
    "detect_truth_direction",
    "[TRUTHFULNESS] Analyze truth direction consistency across claims. Computes a 4-feature truth vector (factConsistency, linguisticConfidence, logicalCoherence, sourceAttribution) and projects each claim onto it. Detects deviant claims that diverge from the dominant truth direction. Use when you need to find which specific claims may be unreliable.",
    truthDirectionInputSchema.shape,
    withBootstrapGate("detect_truth_direction", async (input: TruthDirectionInput) => handleTruthDirection(store, input))
  );

  // ─── Neighborhood Consistency Belief (arXiv:2502.12345 — "Illusions of Confidence?") ───
  server.tool(
    "ncb_check",
    "[TRUTHFULNESS] Test if an answer is genuinely reliable or just a surface-level pattern match. Generates 5 perturbation types (paraphrase, implication, negation, thematic_shift, specificity_change), evaluates consistency under each, and computes a weighted NCB score. Verdict: robust, brittle, or mixed.",
    neighborhoodInputSchema.shape,
    withBootstrapGate("ncb_check", async (input: NeighborhoodInput) => handleNeighborhood(store, input))
  );

  // ─── Logical Consistency Under Transformations (SELFCHECKGPT + Chain-of-Verification) ───
  server.tool(
    "check_logical_consistency",
    "[TRUTHFULNESS] Check logical consistency of claims under formal transformations: negation, conjunction, modus ponens, transitivity, and direct consistency checks. Detects contradictions, circular reasoning, and logical violations. Returns trust level (high/medium/low).",
    logicalConsistencyInputSchema.shape,
    withBootstrapGate("check_logical_consistency", async (input: LogicalConsistencyInput) => handleLogicalConsistency(store, input))
  );

  // ─── Verify-First Strategy (arXiv:2309.11495 — Chain-of-Verification, Meta 2023) ───
  server.tool(
    "verify_first",
    "[TRUTHFULNESS] Apply verification-first strategy before accepting candidate answers. Evaluates across 5 weighted dimensions: factual grounding (0.25), internal consistency (0.25), completeness (0.20), specificity (0.15), and source coherence (0.15). Recommends accept (≥0.75), revise (≥0.45), or reject, with revision suggestions.",
    verifyFirstInputSchema.shape,
    withBootstrapGate("verify_first", async (input: VerifyFirstInput) => handleVerifyFirst(store, input))
  );

  // ─── IoE Self-Correction (Intrinsic Self-Evaluation — "If-or-Else" Confidence Strategy) ───
  server.tool(
    "ioe_self_correct",
    "[TRUTHFULNESS] Confidence-based self-correction: only corrects when confidence is low (< 0.4) to avoid over-correction. Assesses response confidence across 5 metrics. Escalates after 2+ failed attempts. Returns action: accept, correct, or escalate.",
    ioeSelfCorrectInputSchema.shape,
    withBootstrapGate("ioe_self_correct", async (input: IoeSelfCorrectInput) => handleIoeSelfCorrect(store, input))
  );

  // ─── Iterative Self-Critique (Self-Refine + Constitutional AI) ───
  server.tool(
    "self_critique",
    "[TRUTHFULNESS] Run iterative self-critique and refinement cycles on a solution. Evaluates against configurable criteria (accuracy, completeness, clarity, consistency, relevance) through multiple rounds. Detects convergence when improvement plateaus. Use to improve quality of generated content.",
    selfCritiqueInputSchema.shape,
    withBootstrapGate("self_critique", async (input: SelfCritiqueInput) => handleSelfCritique(store, input))
  );

  // ─── Research Pipeline (auto-chains ALL layers in 6 phases) ───
  server.tool(
    "research_pipeline",
    "[PIPELINE] RECOMMENDED for research tasks. Orchestrates all 34 underlying Context-First tool-equivalents through 6 phases (init→gather→review→analyze→verify→finalize). " +
    "NEW: plan→draft→review→fix loop — like compile→test→fix in coding. Init generates a research outline (12+ sections). Each gather adds depth to one section with quality gate (25K char / 500 line min — multiple gathers per section expected). Review runs quality tests and identifies gaps. " +
    "CRITICAL: Interleave web search and gather — after EACH search, IMMEDIATELY call gather with deeply written content. Do NOT batch searches. Each gather writes a file to disk. " +
    "After sufficient gathers, call review to run quality tests. Fix failed sections by gathering again with metadata.targetSection=N. Coverage must reach 60% before analyze. " +
    "Autonomous file writing is ALWAYS ON — files are written to disk during gather, analyze, and finalize phases. Provide outputDir to control destination, or let the pipeline auto-create a temp directory. Finalize works even if verify hasn't passed. " +
    "It does not browse the web or invent source material for you; use it to structure, preserve, pressure-test, and export sourced findings collected from web, GitHub, fetch, or other MCP tools.",
    researchPipelineInputSchema.shape,
    async (input: ResearchPipelineInput) => handleResearchPipeline(store, catalog, memoryManager, siloManager, input)
  );

  server.tool(
    "export_research_files",
    "[EXPORT] Automatically writes research artifacts to disk. It can expand and write every verified report chunk without asking the LLM to loop finalize manually, and it can also write every gathered raw-evidence batch even when verify has not passed yet.",
    exportResearchFilesInputSchema.shape,
    withBootstrapGate(
      "export_research_files",
      withLoopReminder((input: ExportResearchFilesInput) => handleExportResearchFiles(store, memoryManager, input))
    )
  );

  // ─── Self-Register All 37 Tools in Catalog ───
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
      description: "Run a complete context management cycle. Call every 2-3 turns. Auto-extracts facts, checks health, detects conflicts, and returns a directive telling you what to do next. Essential for research, long conversations, memory preservation, and multi-step tasks.",
      inputSchema: loopInputSchema.shape,
      tags: ["loop", "unified", "orchestration", "pipeline", "meta", "context-cycle", "directive", "grounding", "drift", "research", "memory", "preserve", "knowledge", "health", "facts", "essential"],
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
    {
      name: "research_pipeline",
      description: "Structured research orchestration through 6 phases: init, gather, review, analyze, verify, finalize. Outline-driven with per-section quality gates (25K char / 500 line min — multiple gathers accumulate depth). CRITICAL: interleave web search and gather — after EACH search, IMMEDIATELY call gather. Use metadata.targetSection=N to build depth in a section across multiple gathers.",
      inputSchema: researchPipelineInputSchema.shape,
      tags: ["pipeline", "research", "orchestration", "all-layers", "auto-chain", "comprehensive"],
    },
    {
      name: "export_research_files",
      description: "Writes research artifacts directly to disk. Can automatically export every verified report chunk and/or every gathered raw-evidence batch without relying on the LLM to decide part counts.",
      inputSchema: exportResearchFilesInputSchema.shape,
      tags: ["export", "research", "files", "evidence", "report", "writing"],
    },
  ]);

  // ─── MCP Prompts — Execution Protocol & Research Protocol ───

  server.prompt(
    "context-first-protocol",
    "Load the Context-First execution protocol. Call this at the start of any session to understand how to use context_loop and memory tools effectively.",
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: CONTEXT_FIRST_INSTRUCTIONS,
          },
        },
      ],
    })
  );

  server.prompt(
    "research-protocol",
    "Optimized protocol for deep research tasks. 6-phase outline-driven workflow with quality gates, coverage tracking, and review→fix loop.",
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `## Context-First Research Protocol

RECOMMENDED: Use the research_pipeline tool which orchestrates all 34 underlying Context-First tool-equivalents across 6 phases.
The workflow is like coding: plan → write → compile → check errors → fix → retest → ship.

  research_pipeline(phase="init") → generates outline (12+ sections)
  INTERLEAVE: (web search → phase="gather" with metadata.targetSection=N) ×N → each gather drafts one section
  phase="review" → runs quality tests on all sections, identifies thin/missing sections
  Fix failed sections: (web search → phase="gather" with metadata.targetSection=N) for each failure
  phase="review" again → confirm fixes pass
  phase="analyze" → deep reasoning engines (blocked if coverage < 60%)
  phase="verify" → truth/evidence verification
  phase="finalize" → export master synthesis + enriched chunks

QUALITY GATES: Each section must reach 25K chars / 500 lines (accumulated across multiple gathers). Thin sections trigger QUALITY GATE FAILED — do another web search and call gather with metadata.targetSection=N to append more depth. Multiple gathers per section are expected, like iterating on code.
COVERAGE TRACKING: The outline tracks which sections are drafted, passed, or missing. Coverage must reach 60% before analyze, 80% before review passes clean.
REVIEW PHASE: Call review after gathering sufficient sections. It checks every section against quality thresholds and produces a fix list. Like running your test suite — fix failures, then re-review.

CRITICAL WORKFLOW — Interleave search and gather:
  1. Do ONE web search on a specific topic
  2. IMMEDIATELY call gather with deeply written research content, targeting a section: metadata.targetSection=N
  3. Gather writes a file to disk automatically and runs the quality gate
  4. Repeat steps 1-3 for the next section
  Do NOT batch multiple searches before calling gather — context compaction will lose earlier results.
  You are a research AUTHOR: write comprehensive sections with facts, data, analysis, and expert commentary in each gather call.

Important: research_pipeline structures the Context-First workflow, but it does not fetch external sources by itself. Bring sourced findings into each gather phase from web, GitHub, fetch, or other MCP tools.
Autonomous file writing (ALWAYS ON): The pipeline writes files to disk automatically during gather, analyze, and finalize. No outputDir needed — a temp directory is auto-created if you don't provide one (path reported in init directive). Finalize runs even without verify passing.
Optionally call export_research_files with exportRawEvidence=true after finalize for additional raw evidence backup.

If you need manual control instead, follow this sequence:

### Phase 1: Initialize (BEFORE any research)
1. Call \`context_loop\` with your research task description
2. Call \`memory_recall\` to check for existing relevant knowledge
3. Read the directive — it tells you if you have enough context to start

### Phase 2: Gather (INTERLEAVE — one search, one gather, repeat)
1. Do ONE web search on a specific topic
2. IMMEDIATELY call \`memory_store\` with deeply written content based on the search
3. Call \`context_loop\` with recent messages — check health
4. Repeat steps 1-3 for the next topic
Do NOT do multiple searches before storing. Each search-store pair preserves content before compaction.

### Phase 3: Draft
1. Generate your research output section by section
2. IMMEDIATELY call \`context_loop\` with your draft as the assistant message
3. If directive.action = "deepen": re-elaborate ALL flagged shallow sections before continuing
4. If directive.action = "verify": fact-check flagged claims before continuing

### Phase 4: Verify & Finalize
1. Call \`context_loop\` with claim= set to your key conclusions
2. Address any abstention, grounding, or truth direction issues
3. Call \`memory_store\` to save the final research for future recall
4. Call \`memory_compact\` if you stored many items

### Key Rules
- NEVER skip Phase 1 or Phase 3 step 2
- NEVER batch multiple web searches before calling gather — interleave strictly
- The depth check in context_loop catches shallow "breadth-over-depth" patterns
- The truth direction check catches claims that contradict verified facts
- Memory tools preserve research across conversation turns and sessions`,
          },
        },
      ],
    })
  );

  return { server, store, siloManager, catalog, memoryManager };
}
