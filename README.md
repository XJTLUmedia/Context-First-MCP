<div align="center">

# Context-First MCP

**The MCP server that keeps your AI grounded, coherent, and honest — across every turn.**

[![npm version](https://img.shields.io/npm/v/context-first-mcp?color=blue)](https://www.npmjs.com/package/context-first-mcp)
[![npm downloads](https://img.shields.io/npm/dm/context-first-mcp?color=brightgreen)](https://www.npmjs.com/package/context-first-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-listed-orange)](https://smithery.ai)
[![Glama](https://glama.ai/mcp/servers/badge)](https://glama.ai/mcp/servers)
[![Node ≥18](https://img.shields.io/badge/node-%3E%3D18-blue)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178c6)](https://www.typescriptlang.org)

```bash
npx context-first-mcp
```

*Works instantly with Claude Desktop · Cursor · VS Code · any MCP client · Vercel remote — zero API keys needed.*

</div>

---

> **37 research-backed tools** across 7 layers — context health, state, sandboxing, persistent memory, advanced reasoning, truthfulness verification, orchestration, structured research, and autonomous file export. One `context_loop` call replaces 6–7 individual tools and returns a unified action directive.

---

## Why Your AI Conversations Break Down

Long AI conversations fail in predictable ways. Context-First fixes all four:

| Failure Mode | What Goes Wrong | Context-First Solution |
|---|---|---|
| **Context Drift** | AI forgets earlier decisions and intent as the conversation grows | `context_loop` + `detect_drift` continuously re-anchor every turn |
| **Silent Contradiction** | New inputs silently overrule established facts — the AI doesn't notice | `detect_conflicts` compares every input against locked ground truth |
| **Vague Execution** | AI proceeds on underspecified requirements, producing misaligned output | `check_ambiguity` + `abstention_check` ask clarifying questions instead of guessing |
| **Hallucinated Success** | Tool outputs *look* successful but didn't actually achieve the goal | `verify_execution` rechecks whether the outcome matches the stated intent |

---

## What You Get

**37 production-ready tools** grouped into 7 layers — plus 1 orchestrator that runs them all:

```
context_loop  ─────────────────────────────────────────────────────────────────
  ├─ Layer 1 · Context Health   (9 tools)   recap, conflict, ambiguity, depth …
  ├─ Layer 2 · Sandbox          (3 tools)   discover_tools, quarantine, merge
  ├─ Layer 3 · Persistent Memory(6 tools)   store, recall, compact, graph …
  ├─ Layer 4 · Advanced Reasoning(5 tools)  InftyThink, Coconut, KAG, MindEvo …
  ├─ Layer 5 · Truthfulness     (7 tools)   NCB, IOE, verify_first, self_critique…
  └─ State + Research Pipeline + Export     (7 tools)
```

**One call. One directive. One score.**

```json
{
  "directive": {
    "action": "clarify",
    "contextHealth": 0.62,
    "instruction": "Resolve with the user: (1) Is this a firm requirement? (2) Which framework?",
    "autoExtractedFacts": { "deploy_to": "Vercel" },
    "suggestedNextTools": ["verify_execution", "quarantine_context"]
  }
}
```

---

## Quick Start

### npx — zero install

```bash
npx context-first-mcp
```

### Claude Desktop

```json
{
  "mcpServers": {
    "context-first": {
      "command": "npx",
      "args": ["-y", "context-first-mcp"]
    }
  }
}
```

### Cursor / VS Code

```json
{
  "mcp": {
    "servers": {
      "context-first": {
        "command": "npx",
        "args": ["-y", "context-first-mcp"]
      }
    }
  }
}
```

### Remote (Streamable HTTP)

```json
{
  "mcpServers": {
    "context-first": {
      "url": "https://context-first-mcp.vercel.app/api/mcp"
    }
  }
}
```

### Deploy your own Vercel instance

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/XJTLUmedia/Context-First-MCP&root-directory=packages/remote-server)

---

## Tool Reference

### Layer 1: Core Context Health (9 tools)

| Tool | Purpose |
|------|---------|
| `context_loop` | **One-call orchestrator.** Runs 8 stages (ingest→recap→conflict→ambiguity→entropy→abstention→discovery→synthesis) and returns a single `directive` with `action`, `contextHealth` score, extracted facts, and suggested next tools |
| `recap_conversation` | Extracts hidden intent, key decisions, and produces consolidated state summaries |
| `detect_conflicts` | Compares new input against ground truth; surfaces contradictions |
| `check_ambiguity` | Identifies underspecified requirements and generates clarifying questions |
| `verify_execution` | Validates whether tool outputs actually achieved the stated goal |
| `entropy_monitor` | Proxy-entropy scoring via lexical diversity, contradiction density, hedge frequency, and n-gram repetition (ERGO) |
| `abstention_check` | 5-dimension confidence scoring — abstains with questions rather than hallucinating (RLAAR) |
| `detect_drift` | Detects conversation drift from the original intent |
| `check_depth` | Evaluates response depth against question complexity |

### Layer 1b: State Management (4 tools)

| Tool | Purpose |
|------|---------|
| `get_state` | Retrieve confirmed facts and task status |
| `set_state` | Lock in ground truth — subsequent conflict checks run against these values |
| `clear_state` | Reset specific keys or all state |
| `get_history_summary` | Compressed conversation history with intent annotations |

### Layer 2: Sandbox & Discovery (3 tools)

| Tool | Method | Purpose |
|------|--------|---------|
| `discover_tools` | MCP-Zero + ScaleMCP | Natural-language tool routing — returns only semantically relevant tools, reducing context bloat by up to 98% |
| `quarantine_context` | Multi-Agent Quarantine | Create isolated memory silos for sub-tasks, preventing intent dilution |
| `merge_quarantine` | Multi-Agent Quarantine | Merge silo results with noise filtering — only promoted keys return to main context |

### Layer 3: Persistent Memory (6 tools)

| Tool | Purpose |
|------|---------|
| `memory_store` | Store findings, decisions, and intermediate results with metadata |
| `memory_recall` | Retrieve relevant memories by semantic query |
| `memory_compact` | Compress and consolidate memory entries |
| `memory_graph` | Build and query a knowledge graph from stored memories |
| `memory_inspect` | Inspect memory store contents and statistics |
| `memory_curate` | Deduplicate and organize memory entries |

### Layer 4: Advanced Reasoning (5 tools)

| Tool | Method | Purpose |
|------|--------|---------|
| `inftythink_reason` | InftyThink | Infinite-depth reasoning with adaptive stopping |
| `coconut_reason` | Coconut | Chain-of-Continuous-Thought in latent space |
| `extracot_compress` | ExtraCoT | Compress chain-of-thought while preserving reasoning fidelity |
| `mindevolution_solve` | MindEvolution | Evolutionary search over the solution space |
| `kagthinker_solve` | KAG-Thinker | Knowledge-augmented generation with structured thinking |

### Layer 5: Truthfulness & Verification (7 tools)

| Tool | Purpose |
|------|---------|
| `probe_internal_state` | Probe model consistency across paraphrased prompts |
| `detect_truth_direction` | Detect whether model reasoning is trending toward or away from truth |
| `ncb_check` | Neighborhood consistency check across semantically equivalent inputs |
| `check_logical_consistency` | Verify logical coherence of reasoning chains |
| `verify_first` | Pre-verification before committing to claims |
| `ioe_self_correct` | Intrinsic-extrinsic self-correction |
| `self_critique` | Structured self-critique with improvement suggestions |

### Research Pipeline & Export (2 tools)

| Tool | Purpose |
|------|---------|
| `research_pipeline` | Structured research orchestration across `init → gather → analyze → verify → finalize`. Covers all 34 underlying tool-equivalents — state, sandboxing, memory, reasoning, truthfulness, context health. **Writes files autonomously to disk** as the pipeline runs; no LLM cooperation needed for file output. |
| `export_research_files` | Writes every verified report chunk and/or every raw evidence batch to disk in a single call. |

---

## Built on Peer-Reviewed Research

Every core algorithm traces back to a published paper:

| Algorithm | Paper | arXiv | Tool |
|-----------|-------|-------|------|
| MCP-Zero | Active Tool Request | [2506.01056](https://arxiv.org/abs/2506.01056) | `discover_tools` |
| ScaleMCP | Semantic Tool Grouping | [2505.06416](https://arxiv.org/abs/2505.06416) | `discover_tools` registry |
| ERGO | Entropy-based Quality | [2510.14077](https://arxiv.org/abs/2510.14077) | `entropy_monitor` |
| RLAAR | Calibrated Abstention | [2510.18731](https://arxiv.org/abs/2510.18731) | `abstention_check` |

**Implementation highlights:**
- **Proxy Entropy (ERGO):** 4 response-level proxy signals (lexical diversity, contradiction density, hedge-word frequency, n-gram repetition) replace inaccessible token-level logprobs. Composite score above threshold triggers adaptive context reset.
- **TF-IDF Discovery (MCP-Zero):** Pure TypeScript, zero external dependencies. Indexes all tool descriptions at startup; cosine similarity routes queries to the top-k relevant tools only.
- **Inference-Time Abstention (RLAAR):** 5-dimension confidence scoring replaces the RL training loop. Abstains with targeted questions when confidence < threshold — no hallucination fallback.

### Export Helper (1 tool)

| Tool | Description |
|------|-------------|
| `export_research_files` | Writes research artifacts directly to disk. It can automatically expand and write every verified report chunk without asking the LLM to loop `finalize` manually, and it can also write every gathered raw-evidence batch even when `verify` has not passed. |

#### context_loop Pipeline

```
context_loop (single MCP tool call)
├── Stage 1: INGEST     — Store messages to session history
├── Stage 2: RECAP      — Extract intents, decisions, summaries
├── Stage 3: CONFLICT   — Detect contradictions against ground truth
├── Stage 4: AMBIGUITY  — Check for underspecified requirements
├── Stage 5: ENTROPY    — Monitor output quality degradation (ERGO)
├── Stage 6: ABSTENTION — Multi-dimensional confidence check (RLAAR)
├── Stage 7: DISCOVERY  — Suggest relevant next tools (MCP-Zero)
└── Stage 8: SYNTHESIS   — Combine signals → action recommendation + LLM directive
```

**Synthesis Priority:** `abstain` > `reset` > `clarify` > `proceed`

Each stage runs with independent error isolation — a failure in one stage doesn't block the others. The result includes per-stage timing, status, and detailed results for observability.

#### LLM Directive (NEW)

The `context_loop` response includes a top-level `directive` object designed for LLM consumption — a compact, actionable instruction that replaces the need to parse nested stage results:

```json
{
  "directive": {
    "action": "clarify",
    "instruction": "Before proceeding, resolve these issues with the user:\n1. Could you specify exactly what you mean?\n2. Is this a firm requirement or still open for discussion?",
    "questions": ["Could you specify exactly what you mean?", "Is this a firm requirement?"],
    "contextHealth": 0.62,
    "autoExtractedFacts": { "framework": "React", "deploy_to": "Vercel" },
    "suggestedNextTools": ["verify_execution", "quarantine_context"]
  }
}
```

---

## How `context_loop` Works

```
context_loop (single MCP tool call)
├── Stage 1: INGEST     — Store messages to session history
├── Stage 2: RECAP      — Extract intents, decisions, summaries
├── Stage 3: CONFLICT   — Detect contradictions against ground truth
├── Stage 4: AMBIGUITY  — Check for underspecified requirements
├── Stage 5: ENTROPY    — Monitor output quality degradation (ERGO)
├── Stage 6: ABSTENTION — Multi-dimensional confidence check (RLAAR)
├── Stage 7: DISCOVERY  — Suggest relevant next tools (MCP-Zero)
└── Stage 8: SYNTHESIS  — Combine signals → action + directive
```

**Synthesis priority:** `abstain` > `reset` > `clarify` > `proceed`

Each stage runs with independent error isolation. The `directive` response field carries everything an LLM needs:

| Field | Description |
|-------|-------------|
| `action` | `proceed` · `clarify` · `reset` · `abstain` |
| `instruction` | Plain-language guidance for the LLM's next step |
| `questions` | Aggregated clarifying questions (ambiguity + abstention + conflicts) |
| `contextHealth` | 0–1 composite score. 1 = healthy, 0 = degraded |
| `autoExtractedFacts` | Key-value facts auto-extracted from user messages and stored as ground truth |
| `suggestedNextTools` | Relevant tools the LLM should consider next |

**Smart defaults:** `currentInput` is auto-inferred from the last user message. Facts like "use React" are extracted and stored automatically.

---

## Usage Protocol: Getting the Most from Context-First

> **The #1 mistake:** LLMs treat `context_loop` as optional. It's not — it's the backbone.

### Built-in Enforcement (v1.2.1+)

The server ships with four compliance mechanisms that require zero configuration:

1. **Server Instructions** — Full usage protocol injected at MCP handshake via `ServerOptions.instructions`
2. **Bootstrap Gate** — First non-`context_loop` call appends a strong redirect reminder
3. **Cross-Tool Reminders** — After 3 consecutive calls without `context_loop`, reminders appear in tool responses
4. **MCP Prompts** — `context-first-protocol` and `research-protocol` prompt templates available on demand

### Reinforce in Your System Prompt (Optional)

```
When using Context-First MCP:
1. Call context_loop BEFORE any complex task
2. Call context_loop every 2–3 tool calls
3. Call context_loop AFTER generating long-form output
4. ALWAYS follow directive.action (proceed/clarify/reset/abstain/deepen/verify)
5. Use memory_store to save findings; memory_recall to retrieve them
```

### Research Task Workflow

`research_pipeline` orchestrates memory, phase control, reasoning, and autonomous file writing. It is not a web crawler — bring your own sources from web search, GitHub, fetch tools, PDFs, or any other MCP.

```
Phase 1 · Init     research_pipeline(init) → sets up state, enables autonomous file writing
Phase 2 · Gather   ONE web search → research_pipeline(gather) → file written to disk → repeat
Phase 3 · Analyze  research_pipeline(analyze) → reasoning engines produce clean analysis file
Phase 4 · Verify   research_pipeline(verify) → context health gate (non-blocking)
Phase 5 · Finalize research_pipeline(finalize) → synthesis.md + all batch files on disk

Automation shortcut:
  export_research_files(outputDir, exportVerifiedReport=true)  → write all report chunks
  export_research_files(outputDir, exportRawEvidence=true)     → write all evidence batches
```

**Autonomous file writing is always on.** Files are written to `./context-first-research-output/` by default — no LLM cooperation required. Pass `outputDir` to override.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│               @xjtlumedia/context-first-mcp-server            │
│                     (Core — shared logic)                     │
│                                                               │
│  Layer 1: Context Health    (9 tools)                         │
│  Layer 2: Sandbox           (3 tools)                         │
│  Layer 3: Persistent Memory (6 tools)                         │
│  Layer 4: Advanced Reasoning(5 tools)                         │
│  Layer 5: Truthfulness      (7 tools)                         │
│  State (4) · Orchestrator · Pipeline · Export                 │
└──────────────┬───────────────────────┬──────────────────────┘
               │                       │
        ┌──────▼──────┐         ┌──────▼────────┐
        │ stdio-server │         │ remote-server │
        │ (npx local)  │         │   (Vercel)    │
        │   stdio      │         │ Streamable    │
        │  37 tools    │         │    HTTP       │
        └──────────────┘         │   37 tools    │
                                 └───────────────┘
```

- **Core library** (`@xjtlumedia/context-first-mcp-server`): All tool implementations. Zero external API keys — heuristic-based by default.
- **stdio-server** (`context-first-mcp`): `npx` entry point, stdio transport, 37 tools.
- **remote-server**: Vercel serverless, Streamable HTTP transport, 37 tools.

---

## Frontend Demo

Try all 37 tools live in your browser at **[context-first-mcp.vercel.app](https://context-first-mcp.vercel.app)**.

---

## Development

```bash
git clone https://github.com/XJTLUmedia/Context-First-MCP.git
cd Context-First-MCP
pnpm install

# Build everything
pnpm build

# Run stdio server
cd packages/stdio-server && pnpm start

# Run frontend
cd packages/frontend && pnpm dev

# Tests
pnpm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

---

<div align="center">

**Context-First MCP** · [@xjtlumedia/context-first-mcp-server](https://www.npmjs.com/package/@xjtlumedia/context-first-mcp-server) · [context-first-mcp](https://www.npmjs.com/package/context-first-mcp)

*Built for every developer tired of watching their AI lose the plot.*

</div>
