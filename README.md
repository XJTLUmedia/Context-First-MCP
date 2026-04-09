# Context-First MCP

[![npm version](https://img.shields.io/npm/v/context-first-mcp?color=blue)](https://www.npmjs.com/package/context-first-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-listed-orange)](https://smithery.ai)
[![Glama](https://glama.ai/mcp/servers/badge)](https://glama.ai/mcp/servers)

> A **Context Custodian MCP server** that fights LLM conversation degradation with 14 tools backed by 4 research papers — a unified context loop, active tool discovery (MCP-Zero), entropy-guided resetting (ERGO), context quarantining, and verifiable abstention (RLAAR).

---

## The Problem

Every long AI conversation suffers from four structural gaps:

| Gap | What Goes Wrong |
|-----|----------------|
| **Lost in Conversation** | AI loses track of earlier context, decisions, and intent as conversations grow |
| **Context Clash** | New user input contradicts previously established facts without anyone noticing |
| **Calibration & Trust** | AI proceeds on vague, underspecified requirements instead of asking questions |
| **Benchmark vs Reality** | Tool outputs look successful but didn't actually achieve the goal |

## The Solution: 14 MCP Tools

### Layer 1: Core Context Management (8 tools)

| Tool | Gap | Description |
|------|-----|-------------|
| `recap_conversation` | Lost in Conversation | Extracts hidden intents, key decisions, produces consolidated state summaries |
| `detect_conflicts` | Context Clash | Compares new input against ground truth, detects contradictions |
| `check_ambiguity` | Calibration & Trust | Identifies underspecification, generates clarifying questions |
| `verify_execution` | Benchmark vs Reality | Validates tool outputs achieved the stated goal |
| `get_state` | State Management | Retrieves confirmed facts and task status |
| `set_state` | State Management | Locks in confirmed facts to ground truth |
| `clear_state` | State Management | Resets specific keys or all state |
| `get_history_summary` | History | Compressed history with intent annotations |

### Layer 2: Research-Backed Advanced Features (5 tools)

| Tool | Method | Description | Paper |
|------|--------|-------------|-------|
| `discover_tools` | MCP-Zero + ScaleMCP | Describe needed capability in natural language → semantic routing returns relevant tools only, reducing context bloat by up to 98% | [arXiv:2506.01056](https://arxiv.org/abs/2506.01056), [2505.06416](https://arxiv.org/abs/2505.06416) |
| `quarantine_context` | Multi-Agent Quarantine | Create isolated memory silos for sub-tasks, preventing intent dilution | Architecture pattern |
| `merge_quarantine` | Multi-Agent Quarantine | Merge silo results back with noise filtering, only promoted keys return | Architecture pattern |
| `entropy_monitor` | ERGO | Proxy entropy metrics detect confusion spikes via lexical diversity, contradiction density, hedge-word frequency, repetition. Triggers adaptive reset | [arXiv:2510.14077](https://arxiv.org/abs/2510.14077) |
| `abstention_check` | RLAAR | Evaluates if model has sufficient verified info to proceed. 5-dimension confidence scoring. Abstains with questions rather than hallucinating | [arXiv:2510.18731](https://arxiv.org/abs/2510.18731) |

### Layer 3: Unified Orchestration (1 tool)

| Tool | Description |
|------|-------------|
| `context_loop` | **One call to rule them all.** Runs a complete context management cycle — ingest → recap → conflict detection → ambiguity check → entropy monitoring → abstention evaluation → tool discovery — and returns a single action recommendation: `proceed`, `clarify`, `reset`, or `abstain`. Replaces 6-7 individual tool calls with a unified pipeline. Works identically on local (stdio) and remote (HTTP) transports. |

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

| Field | Description |
|-------|-------------|
| `action` | What to do: `proceed`, `clarify`, `reset`, or `abstain` |
| `instruction` | Plain-language guidance for the LLM's next step |
| `questions` | Aggregated clarifying questions from all stages (ambiguity + abstention + conflicts) |
| `contextHealth` | 0-1 composite score. 1 = healthy, 0 = degraded |
| `autoExtractedFacts` | Key-value facts auto-extracted from user messages and stored as ground truth |
| `suggestedNextTools` | External tools the LLM should consider (excludes tools already run in the loop) |

**Smart defaults:**
- `currentInput` is auto-inferred from the last user message if not provided
- Ground-truth facts are auto-extracted from user messages (e.g., "use React" → `{"use_react": "React"}`)
- Discovery results exclude context-loop internal tools to avoid circular suggestions

## Research Foundations

This server implements findings from 4 peer-reviewed papers, adapted for inference-time MCP deployment:

| Paper | arXiv | Key Contribution | Our Tool |
|-------|-------|-------------------|----------|
| MCP-Zero | [2506.01056](https://arxiv.org/abs/2506.01056) | Active tool request + hierarchical semantic routing | `discover_tools` |
| ScaleMCP | [2505.06416](https://arxiv.org/abs/2505.06416) | Semantic grouping prevents tool description bloat | `discover_tools` (registry) |
| ERGO | [2510.14077](https://arxiv.org/abs/2510.14077) | Shannon entropy spikes → adaptive prompt consolidation | `entropy_monitor` |
| RLAAR | [2510.18731](https://arxiv.org/abs/2510.18731) | Curriculum RL for calibrated abstention over hallucination | `abstention_check` |

### Implementation Notes

- **Proxy Entropy (ERGO)**: Since MCP tools cannot access token-level logprobs, we use 4 response-level proxy signals: lexical diversity (unique token ratio), contradiction density (negation pattern frequency), hedge-word frequency ("maybe", "probably", "I think"), and repetition score (n-gram overlap). When the composite entropy score crosses a configurable threshold, the tool recommends an adaptive reset — consolidating context rather than continuing with degraded signal.
- **TF-IDF Discovery (MCP-Zero)**: Pure TypeScript TF-IDF with cosine similarity for zero-dependency tool matching. The registry indexes all tool descriptions at startup and returns only semantically relevant tools for a natural language query, preventing the context bloat that comes from exposing all tools at once. Optional embedding provider support for production accuracy.
- **Inference-Time Abstention (RLAAR)**: 5-dimension confidence scoring replaces the RL training loop from the paper. Checks state completeness, recency, contradiction-free status, ambiguity-free status, and source quality. When confidence is below threshold, the tool abstains with specific clarifying questions rather than allowing the model to hallucinate an answer.

## Quick Start

### npx (no install needed)

```bash
npx context-first-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

### Cursor

Add to your MCP settings:

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

### VS Code

Add to `settings.json`:

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

For clients that support remote MCP servers:

```json
{
  "mcpServers": {
    "context-first": {
      "url": "https://context-first-mcp.vercel.app/api/mcp"
    }
  }
}
```

## Vercel Deployment

Deploy your own instance:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/context-first/mcp&root-directory=packages/remote-server)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│        @xjtlumedia/context-first-mcp-server               │
│              (Core — shared logic)                        │
│                                                          │
│  Layer 1: Tools (recap, conflict, ambiguity, verify)     │
│  Layer 2: Tools (discover, quarantine, entropy, abstain) │
│  Layer 3: Unified Loop (context_loop orchestration)      │
│  State + Silos + Engine + Registry                       │
└──────────┬──────────────────────┬────────────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │ stdio-server │        │remote-server│
    │ (npx local)  │        │ (Vercel)    │
    │ Transport:   │        │ Transport:  │
    │   stdio      │        │ Streamable  │
    │ ALL 14 tools │        │ HTTP        │
    └──────────────┘        │ ALL 14 tools│
                            └─────────────┘
```

**Core Library** (`@xjtlumedia/context-first-mcp-server`): All 14 tool implementations, state management, memory silos, entropy engine, tool registry, unified loop orchestration, and abstention scoring. Zero external API keys required — heuristic-based analysis by default.

**stdio-server** (`context-first-mcp`): npx entry point for local use. Uses stdio transport per MCP spec. Exposes all 14 tools.

**remote-server**: Vercel serverless function with Streamable HTTP transport. Session state in lambda memory. Exposes all 14 tools.

## Frontend Demo

Visit the interactive showcase at [context-first-mcp.vercel.app](https://context-first-mcp.vercel.app) to try all tools in your browser.

## Development

```bash
# Clone and install
git clone https://github.com/context-first/mcp.git
cd mcp
pnpm install

# Build all packages
pnpm build

# Run stdio server locally
cd packages/stdio-server && pnpm start

# Run frontend dev server
cd packages/frontend && pnpm dev
```

## Configuration

### Optional LLM Provider

The server works without any API keys using heuristic analysis. For enhanced analysis, set:

```bash
# Environment variables (optional)
LLM_PROVIDER=openai   # or "anthropic"
LLM_API_KEY=sk-...
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
