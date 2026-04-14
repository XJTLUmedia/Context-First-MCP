<div align="center">

# @xjtlumedia/context-first-mcp-server

**Core library powering the Context-First MCP ecosystem — 37 tools across 7 layers for context health, memory, reasoning, and truthfulness.**

[![npm version](https://img.shields.io/npm/v/@xjtlumedia/context-first-mcp-server?color=blue)](https://www.npmjs.com/package/@xjtlumedia/context-first-mcp-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)
[![Node ≥18](https://img.shields.io/badge/node-%3E%3D18-blue)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178c6)](https://www.typescriptlang.org)

</div>

---

> **Looking for the ready-to-run MCP server?** Use [`context-first-mcp`](https://www.npmjs.com/package/context-first-mcp) via `npx context-first-mcp` — zero install needed.
>
> This package is the **shared core library** consumed by the stdio and remote servers. Use it if you are building your own MCP transport layer or embedding Context-First tools in a larger application.

---

## Installation

```bash
npm install @xjtlumedia/context-first-mcp-server
# or
pnpm add @xjtlumedia/context-first-mcp-server
```

**Node ≥ 18 required.**

---

## What This Package Exports

### `createServer(options?)`

Creates a fully configured [`McpServer`](https://github.com/modelcontextprotocol/typescript-sdk) instance with all 37 tools registered, MCP prompts attached, and server-level usage instructions injected (visible to LLMs during handshake).

```ts
import { createServer } from "@xjtlumedia/context-first-mcp-server";

const server = createServer({ name: "my-context-first-server", version: "1.0.0" });

// Connect to any MCP transport
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
```

### State & Session

```ts
import { SessionStore, SiloManager } from "@xjtlumedia/context-first-mcp-server";

const store = new SessionStore();       // Per-session key-value + history
const silos = new SiloManager(store);   // Multi-agent quarantine silos
```

### Tool Catalog (TF-IDF Discovery)

```ts
import { ToolCatalog, TfIdfIndexer } from "@xjtlumedia/context-first-mcp-server";

const catalog = new ToolCatalog();
// catalog.registerBatch([...]) — register tools for semantic routing
// catalog.query("search query", topK) — returns relevant tools only
```

### Persistent Memory

```ts
import { UnifiedMemoryManager } from "@xjtlumedia/context-first-mcp-server";
```

### Type Exports

All state, registry, and memory types are re-exported:

```ts
import type {
  // State types
  SessionState, HistoryEntry, GroundTruth,
  // Registry types
  ToolEntry,
  // Memory types
  MemoryEpisode, MemoryTier,
} from "@xjtlumedia/context-first-mcp-server";
```

---

## Tool Layers

| Layer | Tools | Description |
|-------|-------|-------------|
| **Orchestrator** | `context_loop` | 8-stage pipeline: ingest → recap → conflict → ambiguity → entropy → abstention → discovery → synthesis |
| **Layer 1 · Context Health** | 8 tools | `recap_conversation`, `detect_conflicts`, `check_ambiguity`, `verify_execution`, `entropy_monitor`, `abstention_check`, `detect_drift`, `check_depth` |
| **Layer 1b · State** | 4 tools | `get_state`, `set_state`, `clear_state`, `get_history_summary` |
| **Layer 2 · Sandbox** | 3 tools | `discover_tools`, `quarantine_context`, `merge_quarantine` |
| **Layer 3 · Memory** | 6 tools | `memory_store`, `memory_recall`, `memory_compact`, `memory_graph`, `memory_inspect`, `memory_curate` |
| **Layer 4 · Reasoning** | 5 tools | `inftythink_reason`, `coconut_reason`, `extracot_compress`, `mindevolution_solve`, `kagthinker_solve` |
| **Layer 5 · Truthfulness** | 7 tools | `probe_internal_state`, `detect_truth_direction`, `ncb_check`, `check_logical_consistency`, `verify_first`, `ioe_self_correct`, `self_critique` |
| **Research & Export** | 2 tools | `research_pipeline`, `export_research_files` |

---

## Architecture

This package is the shared core consumed by both transport layers:

```
@xjtlumedia/context-first-mcp-server   ← this package
├── All 37 tool implementations
├── SessionStore · SiloManager
├── UnifiedMemoryManager
├── ToolCatalog · TfIdfIndexer
├── Engine: loop-freshness, NLP utils
└── Research pipeline (autonomous file writing)

        ↑ imported by
        │
        ├── context-first-mcp         (npx / stdio transport)
        └── @xjtlumedia/context-first-remote-server  (Vercel / HTTP transport)
```

---

## Usage Protocol

When `createServer()` connects to an LLM-facing client, the `CONTEXT_FIRST_INSTRUCTIONS` are injected at handshake time via `ServerOptions.instructions`. The LLM receives:

- Mandatory `context_loop` call cadence
- Research workflow: **interleave** one search → one `research_pipeline(gather)` → repeat
- Memory preservation guide (`memory_store` / `memory_recall`)
- Autonomous file writing: pipeline writes `*.batch-N.topic.md`, `*.analysis.md`, `*.synthesis.md` to disk without LLM cooperation

---

## Research Pipeline — Autonomous File Writing

```
research_pipeline({ action: "init",     topic, outputDir? }) → state initialized, outputDir confirmed
research_pipeline({ action: "gather",   content, topic })   → batch-N.topic.md written to disk
research_pipeline({ action: "analyze",  problem })          → analysis.md written to disk
research_pipeline({ action: "verify",   claims })           → health gate (non-blocking)
research_pipeline({ action: "finalize" })                   → synthesis.md + all batch files on disk
```

`outputDir` defaults to `./context-first-research-output/` when not provided. Set it explicitly to control the output location.

---

## Development

```bash
git clone https://github.com/XJTLUmedia/Context-First-MCP.git
cd Context-First-MCP
pnpm install

# Build this package only
pnpm --filter @xjtlumedia/context-first-mcp-server build

# Run tests
pnpm --filter @xjtlumedia/context-first-mcp-server test

# Type-check only
pnpm --filter @xjtlumedia/context-first-mcp-server exec tsc --noEmit
```

---

## Related Packages

| Package | Description |
|---------|-------------|
| [`context-first-mcp`](https://www.npmjs.com/package/context-first-mcp) | `npx`-ready stdio server — the easiest way to run Context-First |
| [`@xjtlumedia/context-first-remote-server`](https://github.com/XJTLUmedia/Context-First-MCP/tree/main/packages/remote-server) | Vercel Streamable HTTP transport |

Full documentation, Claude Desktop / Cursor / VS Code setup, and the tool reference are in the [main README](https://github.com/XJTLUmedia/Context-First-MCP#readme).

---

## License

[MIT](../../LICENSE) — © XJTLUmedia
