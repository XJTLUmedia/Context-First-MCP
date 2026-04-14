import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionStore } from "./state/store.js";
import { SiloManager } from "./state/silo.js";
import { ToolCatalog } from "./registry/catalog.js";
import {
  contextHealthInputSchema,
  handleContextHealth,
  type ContextHealthInput,
} from "./tools/context-health.js";
import {
  sandboxInputSchema,
  handleSandbox,
  type SandboxInput,
} from "./tools/sandbox.js";
import {
  memoryLayerInputSchema,
  handleMemoryLayer,
  type MemoryLayerInput,
} from "./tools/memory-layer.js";
import {
  reasonInputSchema,
  handleReason,
  type ReasonInput,
} from "./tools/reason.js";
import {
  truthcheckInputSchema,
  handleTruthcheck,
  type TruthcheckInput,
} from "./tools/truthcheck.js";
import {
  loopInputSchema,
  handleLoop,
  type LoopToolInput,
} from "./tools/loop.js";
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

You have access to the Context-First MCP server with 8 tools organized in layers. Follow this protocol strictly:

### MANDATORY: context_loop is your primary tool
- Call \`context_loop\` BEFORE starting any complex task (research, multi-step workflows, long-form generation)
- Call \`context_loop\` every 2-3 tool calls or conversation turns during ongoing work
- Call \`context_loop\` AFTER generating any long-form output to check depth and quality
- ALWAYS read and follow the \`directive.action\` in the response (proceed/clarify/reset/abstain/deepen/verify)

### When directive.action = "deepen"
Your output was detected as shallow. You MUST re-elaborate the flagged sections with specific examples, data, evidence, and analysis BEFORE moving on. Do NOT skip this.

### When directive.action = "verify"
Claims in your output may be false. You MUST verify flagged claims against sources before presenting them.

### Tool Architecture (8 tools, 5 layers)

**context_loop** — [ORCHESTRATOR] Call this FIRST and every 2-3 turns. Runs ALL health checks automatically.

**context_health** — [LAYER 1: CONTEXT & STATE] 13 sub-tools for context health and state management.
  Sub-tools: recap, conflict, ambiguity, verify, entropy, abstention, grounding, drift, depth, get_state, set_state, clear_state, history.
  Auto-selects based on params. Use 'check' field to override.
  Examples: context_health({params: {messages: [...]}}) → runs recap
           context_health({check: "set_state", params: {key: "lang", value: "TypeScript"}})

**sandbox** — [LAYER 2: SANDBOX] Tool discovery, context quarantine, and merge.
  Sub-tools: discover, quarantine, merge.
  Auto-selects based on params. Use 'action' field to override.
  Examples: sandbox({params: {query: "memory tools"}}) → discovers tools
           sandbox({params: {name: "experiment", inheritKeys: ["lang"]}}) → creates quarantine silo

**memory** — [LAYER 3: MEMORY] Hierarchical memory management.
  Sub-tools: store, recall, compact, graph, inspect, curate.
  Auto-selects based on params. Use 'action' field to override.
  Examples: memory({params: {role: "user", content: "key finding..."}}) → stores memory
           memory({params: {query: "previous findings"}}) → recalls relevant memories

**reason** — [LAYER 4: REASONING] 5 advanced reasoning engines.
  Sub-tools: inftythink (iterative), coconut (multi-perspective), extracot (compress chains), mindevolution (evolutionary), kagthinker (logical decomposition).
  Auto-selects based on params. Use 'method' field to override.
  Examples: reason({params: {problem: "complex question"}}) → defaults to inftythink
           reason({method: "kagthinker", params: {problem: "...", knownFacts: [...]}})

**truthcheck** — [LAYER 5: TRUTHFULNESS] 7 truth verification tools.
  Sub-tools: probe (linguistic signals), truth_direction (truth vector), ncb (perturbation robustness), logic (formal consistency), verify_first (5-dim verification), ioe (confidence correction), self_critique (iterative refinement).
  Auto-selects based on params. Use 'check' field to override. Set cascade=true for auto-correction on low scores.
  Examples: truthcheck({params: {assistantOutput: "..."}}) → runs probe + truth_direction
           truthcheck({params: {claims: ["claim1", "claim2"]}}) → checks logical consistency

**research_pipeline** — [PIPELINE] Structured research orchestration through 6 phases.
**export_research_files** — [EXPORT] Write research artifacts to disk.

### Memory Preservation
- Use memory({params: {role: "user", content: "..."}}) to save important findings
- Use memory({params: {query: "..."}}) to retrieve relevant previous findings
- Use memory({action: "compact"}) when memory grows large

### Call Frequency Guide
- Research tasks: context_loop at start → every 2 searches → after draft → before final
- Multi-step tasks: context_loop at start → after each major step
- Long conversations: context_loop every 3 turns minimum

### RECOMMENDED: research_pipeline for research tasks
For any research, analysis, or deep investigation task, use \`research_pipeline\` instead of calling individual tools.
It auto-chains all underlying Context-First tool-equivalents across 6 phases:
  1. \`init\` — context_loop + memory recall + state check + discover
  2. \`gather\` — memory store + knowledge graph + context_loop health check + AUTONOMOUS FILE WRITE
  3. \`analyze\` — quarantine sandbox + all 5 reasoning engines + memory + context_loop
  4. \`verify\` — context_loop (strict thresholds) + memory cross-check + verification persistence
  5. \`finalize\` — memory operations + history summary + export manifest + context_loop

CRITICAL: After EACH web search, IMMEDIATELY call gather. Do NOT batch searches.

### Do NOT
- Generate long research reports without calling context_loop first and after
- Ignore directive actions — they are instructions, not suggestions
- Assume research_pipeline replaces evidence gathering — it preserves, pressure-tests, and verifies sourced findings

### Tool Naming Convention
All tool names use UNDERSCORES, not hyphens. Layer tools auto-select sub-tools from params — you rarely need to specify check/action/method unless you want to override.`;

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
 * Create a Context-First MCP server with 8 tools (5 layer tools + 3 standalone).
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

  // ─── Layer 1: Context Health & State ───
  server.tool(
    "context_health",
    "[CONTEXT & STATE] 13 sub-tools: recap, conflict, ambiguity, verify, entropy, abstention, grounding, drift, depth, get_state, set_state, clear_state, history. Auto-selects based on params or use 'check' to override. TIP: context_loop runs all health checks automatically — prefer context_loop for comprehensive analysis, use context_health for targeted checks.",
    contextHealthInputSchema.shape,
    withBootstrapGate("context_health", withLoopReminder(
      async (input: ContextHealthInput) => handleContextHealth(store, input)
    ))
  );

  // ─── Layer 2: Sandbox ───
  server.tool(
    "sandbox",
    "[SANDBOX] 3 sub-tools: discover (semantic tool search via TF-IDF), quarantine (isolated state sandbox), merge (merge/discard silo). Auto-selects based on params or use 'action' to override.",
    sandboxInputSchema.shape,
    withBootstrapGate("sandbox", withLoopReminder(
      async (input: SandboxInput) => handleSandbox(catalog, siloManager, input)
    ))
  );

  // ─── Layer 3: Memory ───
  server.tool(
    "memory",
    "[MEMORY] 6 sub-tools: store (hierarchical ingest), recall (adaptive gate retrieval), compact (compress with integrity), graph (knowledge graph with PageRank), inspect (tier status), curate (importance-based curation). Auto-selects based on params or use 'action' to override. TOOL NAME: memory (use underscores).",
    memoryLayerInputSchema.shape,
    withBootstrapGate("memory", withLoopReminder(
      async (input: MemoryLayerInput) => handleMemoryLayer(memoryManager, input)
    ))
  );

  // ─── Layer 4: Reasoning ───
  server.tool(
    "reason",
    "[REASONING] 5 engines: inftythink (iterative bounded reasoning), coconut (multi-perspective latent analysis), extracot (reasoning chain compression), mindevolution (evolutionary search), kagthinker (structured logical decomposition with dependency DAG). Auto-selects based on params or use 'method' to override.",
    reasonInputSchema.shape,
    withBootstrapGate("reason", withLoopReminder(
      async (input: ReasonInput) => handleReason(input)
    ))
  );

  // ─── Layer 5: Truthfulness ───
  server.tool(
    "truthcheck",
    "[TRUTHFULNESS] 7 tools: probe (linguistic truth signals), truth_direction (truth vector projection), ncb (perturbation robustness), logic (formal logical consistency), verify_first (5-dimension verification), ioe (confidence-based correction), self_critique (iterative refinement). Auto-selects or use 'check' to override. Set cascade=true for auto-correction on low scores.",
    truthcheckInputSchema.shape,
    withBootstrapGate("truthcheck", withLoopReminder(
      async (input: TruthcheckInput) => handleTruthcheck(store, input)
    ))
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

  // ─── Research Pipeline (auto-chains ALL layers in 6 phases) ───
  server.tool(
    "research_pipeline",
    "[PIPELINE] RECOMMENDED for research tasks. Orchestrates all underlying Context-First layers through 6 phases (init→gather→review→analyze→verify→finalize). " +
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

  // ─── Self-Register All 8 Tools in Catalog ───
  catalog.registerBatch([
    {
      name: "context_health",
      description: "Layer 1 – Context Health & State. Recaps conversation, detects conflicts/ambiguity, verifies execution, manages ground-truth state, monitors entropy & depth, checks abstention confidence.",
      inputSchema: contextHealthInputSchema.shape,
      tags: ["context", "health", "state", "recap", "conflict", "ambiguity", "verification", "entropy", "depth", "abstention"],
    },
    {
      name: "sandbox",
      description: "Layer 2 – Isolation & Discovery. Creates quarantine silos for exploratory/multi-agent work, merges or discards them, discovers tools by semantic search.",
      inputSchema: sandboxInputSchema.shape,
      tags: ["sandbox", "quarantine", "silo", "isolation", "multi-agent", "discovery", "tools"],
    },
    {
      name: "memory",
      description: "Layer 3 – Hierarchical Memory. Stores, recalls, compacts, graphs, inspects, and curates memories across a 4-tier hierarchy with knowledge graph and adaptive gate selection.",
      inputSchema: memoryLayerInputSchema.shape,
      tags: ["memory", "store", "recall", "compact", "graph", "inspect", "curate", "hierarchical"],
    },
    {
      name: "reason",
      description: "Layer 4 – Advanced Reasoning. InftyThink iterative reasoning, Coconut latent-space thought, ExtraCoT token compression, MindEvolution search, KAG-Thinker structured decomposition.",
      inputSchema: reasonInputSchema.shape,
      tags: ["reasoning", "inftythink", "coconut", "extracot", "mindevolution", "kagthinker"],
    },
    {
      name: "truthcheck",
      description: "Layer 5 – Truthfulness & Self-Verification. Probes internal state, detects truth direction, NCB perturbation checks, logical consistency, verify-first, IoE self-correction, self-critique.",
      inputSchema: truthcheckInputSchema.shape,
      tags: ["truthfulness", "verification", "probing", "consistency", "self-correction", "self-critique"],
    },
    {
      name: "context_loop",
      description: "Run a complete context management cycle. Call every 2-3 turns. Auto-extracts facts, checks health, detects conflicts, and returns a directive telling you what to do next. Essential for research, long conversations, memory preservation, and multi-step tasks.",
      inputSchema: loopInputSchema.shape,
      tags: ["loop", "unified", "orchestration", "pipeline", "meta", "context-cycle", "directive", "grounding", "drift", "research", "memory", "preserve", "knowledge", "health", "facts", "essential"],
    },
    {
      name: "research_pipeline",
      description: "Structured research orchestration through 6 phases: init, gather, review, analyze, verify, finalize. Outline-driven with per-section quality gates.",
      inputSchema: researchPipelineInputSchema.shape,
      tags: ["pipeline", "research", "orchestration", "all-layers", "auto-chain", "comprehensive"],
    },
    {
      name: "export_research_files",
      description: "Writes research artifacts directly to disk. Can automatically export every verified report chunk and/or every gathered raw-evidence batch.",
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

RECOMMENDED: Use the research_pipeline tool which orchestrates all underlying Context-First layers across 6 phases.
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
2. Call \`memory({ action: "recall", ... })\` to check for existing relevant knowledge
3. Read the directive — it tells you if you have enough context to start

### Phase 2: Gather (INTERLEAVE — one search, one gather, repeat)
1. Do ONE web search on a specific topic
2. IMMEDIATELY call \`memory({ action: "store", ... })\` with deeply written content based on the search
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
3. Call \`memory({ action: "store", ... })\` to save the final research for future recall
4. Call \`memory({ action: "compact" })\` if you stored many items

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
