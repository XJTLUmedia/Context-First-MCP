# Context-First MCP — Debug Analysis: Why Tools Weren't Used

## Executive Summary

The previous conversation attempted to use "EVERY method of context-first MCP" for a stock market technical analysis research task. **Out of 34 registered tools, only 1 was successfully called (`memory_store` via context-first, once at the very end). The other 33 tools were never invoked.** Three `memory-store` calls failed due to wrong tool naming. The critical `context_loop` — the server's backbone — was never called once.

---

## 1. What Actually Happened (Forensic Trace)

### Tools Successfully Called via Context-First MCP
| Tool | Times Called | Notes |
|------|-------------|-------|
| `memory_store` (context-first) | 1 | Only at the very end, as a completion summary |

### Tools That FAILED
| Attempted Tool | Error | Root Cause |
|---------------|-------|------------|
| `memory-store` (hyphenated) | "Tool 'memory-store' does not exist" × 3 | **Wrong name**: actual name is `memory_store` (underscored) |

### Tools Called via WRONG MCP Server
| Tool | MCP Used | Should Have Used |
|------|----------|------------------|
| Create Entities | `memory` (separate MCP) | `memory_graph` (context-first) |
| Create Relations | `memory` (separate MCP) | `memory_graph` (context-first) |
| Add Observations | `memory` (separate MCP) | `memory_graph` (context-first) |

### Context-First Tools NEVER Called (33 of 34)
**Layer 1 — Context Health:**
- ❌ `context_loop` — **THE primary tool, never called once**
- ❌ `recap_conversation`
- ❌ `detect_conflicts`
- ❌ `check_ambiguity`
- ❌ `verify_execution`

**State Management:**
- ❌ `get_state` / `set_state` / `clear_state`
- ❌ `get_history_summary`

**Layer 2 — Research Tools:**
- ❌ `discover_tools`
- ❌ `quarantine_context` / `merge_quarantine`
- ❌ `entropy_monitor`
- ❌ `abstention_check`
- ❌ `check_grounding`
- ❌ `detect_drift`
- ❌ `check_depth`

**Layer 3 — Memory (5 of 6 unused):**
- ❌ `memory_recall`
- ❌ `memory_compact`
- ❌ `memory_graph`
- ❌ `memory_inspect`
- ❌ `memory_curate`

**Layer 4 — Advanced Reasoning:**
- ❌ `inftythink_reason`
- ❌ `coconut_reason`
- ❌ `extracot_compress`
- ❌ `mindevolution_solve`
- ❌ `kagthinker_solve`

**Layer 5 — Truthfulness Verification:**
- ❌ `probe_internal_state`
- ❌ `detect_truth_direction`
- ❌ `ncb_check`
- ❌ `check_logical_consistency`
- ❌ `verify_first`
- ❌ `ioe_self_correct`
- ❌ `self_critique`

---

## 2. Root Cause Analysis (7 Identified Gaps)

### Gap A: MCP Server Was Not Connected / Not Discoverable
**Evidence:** `tool_search_tool_regex` for `context.first` returns **zero results** in the current session. The context-first MCP tools are not registered as available tools in the VS Code MCP client.

**Impact:** CRITICAL. If the tools aren't available to the agent, nothing else matters.

**Likely Causes:**
1. No `.vscode/mcp.json` exists in the workspace — the MCP server was never configured for VS Code
2. The `stdio-server` package may not be built (`dist/` may not exist)
3. The npm publish was blocked (repo memory: "blocked by npm 24h unpublish cooldown — retry after 2026-04-11T03:29 UTC")
4. Even if published, VS Code needs explicit configuration to connect

### Gap B: Tool Name Collision / Confusion
**Evidence:** Agent called `memory-store` (hyphenated) 3 times → "Tool does not exist". The registered name is `memory_store` (underscored). The **file** is named `memory-store.ts` but the **tool** is registered as `memory_store`.

**Impact:** HIGH. Three data preservation operations were silently dropped.

**Systemic Issue:** MCP tool names use underscores (`memory_store`, `context_loop`) while:
- Source file names use hyphens (`memory-store.ts`, `loop-freshness.ts`)
- The agent's internal tool namespace for OTHER MCPs uses hyphens (e.g., `memory` MCP's tools)
- LLMs naturally infer tool names from file names → wrong guess

### Gap C: `context_loop` Was Never Called — The Bootstrap Problem
**Evidence:** The most critical tool was never invoked. The `withLoopReminder` mechanism can only fire AFTER a context-first tool is already called. If no CF tools are called, no reminders fire. Classic chicken-and-egg.

**The Failure Cascade:**
```
Agent starts task
  → Doesn't call context_loop (no enforcement at bootstrap)
  → Calls web search, SQL, other MCPs instead
  → No context-first tools called = no withLoopReminder fires
  → Loop freshness record never created
  → Reminders never injected
  → Agent completes entire task without context-first
```

**Why `ServerOptions.instructions` didn't help:** The instructions ARE injected during MCP `initialize` handshake, but:
1. VS Code Copilot may not surface MCP server instructions in the LLM's system prompt
2. Even if surfaced, instructions compete with hundreds of other system prompt lines
3. Instructions say "follow this protocol strictly" but there's no enforcement mechanism — it's a suggestion

### Gap D: Cognitive Overload — 34 Tools, No Hierarchy
**Evidence:** (Already documented in repo memory) "Root causes: LLM cognitive overload (34 tools)"

The tool list exposed to the LLM looks like a flat wall of 34 items. When the agent has access to multiple MCP servers (memory, github, ai-answer-copier, context-first), it must choose among potentially 100+ tools. Without strong priming, the LLM defaults to familiar patterns (web search → write file).

**Data Point:** The agent used `memory` MCP (Create Entities/Relations) instead of context-first's `memory_graph` because the `memory` MCP was more familiar / already primed.

### Gap E: No MCP Prompt Auto-Loading
**Evidence:** Neither `context-first-protocol` nor `research-protocol` prompts were loaded.

MCP prompts are passive — they exist but must be explicitly requested by the client (e.g., via `prompts/get`). VS Code Copilot does NOT auto-load MCP prompts. The prompts are essentially dead code for most real-world usage.

### Gap F: README Says "14 tools" but Server Has 34
**Evidence:** README line 261: "All 14 tool implementations" and line 263: "Exposes all 14 tools"

The server actually registers 34 tools. This documentation mismatch means:
1. Users don't know what tools are available
2. The architecture diagram shows only layers 1-3, missing layers 4-5
3. The "Usage Protocol" section only mentions `context_loop`, `memory_store`, `memory_recall`, `memory_compact` — not the 30 other tools

### Gap G: No Verification of Research Output
**Evidence:** Despite the user asking to "verify truthfulness as much as possible," zero truthfulness tools were called. Layer 5 has 7 dedicated verification tools, all unused.

The connection from user intent ("verify truthfulness") → available tools (`probe_internal_state`, `detect_truth_direction`, `verify_first`, etc.) was never made because:
1. `context_loop` would have surfaced these via `discovery` stage → but wasn't called
2. `discover_tools` would have matched them → but wasn't called
3. Tool descriptions use academic language ("arXiv:2304.13734") that doesn't match user's natural language

---

## 3. Fix Recommendations

### Fix 1 (CRITICAL): Create `.vscode/mcp.json` 
The most fundamental fix — make the tools actually available.

```json
{
  "servers": {
    "context-first": {
      "command": "node",
      "args": ["packages/stdio-server/dist/index.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

Or for npm-installed:
```json
{
  "servers": {
    "context-first": {
      "command": "npx",
      "args": ["-y", "context-first-mcp"]
    }
  }
}
```

### Fix 2 (HIGH): Add Tool Name Aliases or Clarify in Descriptions
Option A — Register aliases:
```ts
// In index.ts, after registering "memory_store":
server.tool("memory-store", /* same desc */, /* same schema */, /* same handler */);
```

Option B — Add explicit naming in descriptions:
```ts
"Store content into hierarchical memory. TOOL NAME: memory_store (use underscores, NOT hyphens)."
```

### Fix 3 (HIGH): Bootstrap Enforcement — First-Call Interceptor
Add a mechanism that intercepts the FIRST tool call in any session and forces context_loop awareness:

```ts
// In createContextFirstServer, wrap ALL tools with a first-call gate
function withBootstrapGate<T extends Record<string, unknown>>(
  toolName: string,
  handler: (input: T) => Promise<{ content: Array<{ type: "text"; text: string }> }>
): (input: T) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return async (input: T) => {
    const sessionId = (input as { sessionId?: string }).sessionId ?? "default";
    const freshness = getLoopFreshness(sessionId);
    
    if (!freshness.everCalled && toolName !== "context_loop") {
      // BLOCK the call and return a redirect to context_loop
      return {
        content: [{
          type: "text" as const,
          text: `⛔ BLOCKED: You must call context_loop first before using ${toolName}. ` +
            `context_loop initializes the session, checks context health, and tells you what tools to use next. ` +
            `Call: context_loop({ messages: [{ role: "user", content: "<task description>", turn: 1 }] })`
        }]
      };
    }
    
    return handler(input);
  };
}
```

### Fix 4 (MEDIUM): Reduce Cognitive Load — Tool Grouping via Description Prefixes
Prefix tool descriptions with layer identifiers so LLMs can mentally group them:

```ts
// Instead of:
"Analyze conversation history, identify hidden intents..."
// Use:
"[CONTEXT HEALTH] Analyze conversation history, identify hidden intents..."

// Instead of: 
"Probe assistant output for internal state signals..."
// Use:
"[TRUTHFULNESS] Probe assistant output for internal state signals..."
```

Suggested prefixes:
- `[ORCHESTRATOR]` — context_loop
- `[CONTEXT HEALTH]` — recap, conflict, ambiguity, verify, grounding, drift, depth, entropy, abstention
- `[STATE]` — get_state, set_state, clear_state, get_history_summary
- `[MEMORY]` — memory_store, memory_recall, memory_compact, memory_graph, memory_inspect, memory_curate
- `[SANDBOX]` — quarantine_context, merge_quarantine, discover_tools
- `[REASONING]` — inftythink, coconut, extracot, mindevolution, kagthinker
- `[TRUTHFULNESS]` — probe_internal_state, detect_truth_direction, ncb_check, check_logical_consistency, verify_first, ioe_self_correct, self_critique

### Fix 5 (MEDIUM): Update README to Reflect 34 Tools
- Change "14 tools" → "34 tools" throughout
- Add layers 4 and 5 to architecture diagram
- Add a complete tool reference table
- Add examples for truthfulness and reasoning tools

### Fix 6 (LOW): Auto-Surface Prompt on First Connection
Since MCP prompts aren't auto-loaded, embed the research protocol directly in the `ServerOptions.instructions` instead of relying on a separate prompt mechanism:

```ts
const CONTEXT_FIRST_INSTRUCTIONS = `...existing protocol...

## Research Task Quick Reference
Phase 1: context_loop → memory_recall
Phase 2: (2-3 searches) → memory_store → context_loop
Phase 3: Generate → context_loop (depth check) → fix flagged sections  
Phase 4: context_loop (verify) → memory_store → memory_compact
`;
```

### Fix 7 (LOW): Tool Descriptions Should Speak User Language
Replace academic references with user-intent language:

```ts
// Instead of:
"arXiv:2304.13734 — The Internal State of an LLM Knows When It's Lying"
// Use:
"Use when you need to check if claims are likely true or false"

// Instead of:  
"Neighbor-Consistency Belief measurement through 5 perturbation types"
// Use:
"Test if an answer is genuinely reliable or just a surface-level pattern match"
```

---

## 4. Priority Matrix

| Fix | Impact | Effort | Priority |
|-----|--------|--------|----------|
| Fix 1: `.vscode/mcp.json` | CRITICAL | 5 min | P0 |
| Fix 3: Bootstrap enforcement | HIGH | 30 min | P1 |
| Fix 2: Tool name aliases | HIGH | 15 min | P1 |
| Fix 4: Description prefixes | MEDIUM | 20 min | P2 |
| Fix 5: README update | MEDIUM | 30 min | P2 |
| Fix 7: User-language descriptions | LOW | 20 min | P3 |
| Fix 6: Embed research protocol | LOW | 10 min | P3 |

---

## 5. What The Ideal Run Should Have Looked Like

```
1. context_loop({ messages: [{ role: "user", content: "deep analysis of technical analysis...", turn: 1 }] })
   → directive: { action: "proceed", suggestedNextTools: ["memory_recall", "memory_store"] }

2. memory_recall({ query: "technical analysis stock market" })
   → No prior memories found

3. [Web Search #1-3: definitions, indicators, chart patterns]

4. memory_store({ content: "KEY FINDINGS: ..." })

5. context_loop({ messages: [...], claim: "RSI above 70 indicates overbought" })
   → depth check, truth verification, grounding check
   → directive: { action: "deepen", sections: ["RSI analysis lacks examples"] }

6. [Web Search #4-6: advanced topics, risk management, Elliott Wave]

7. memory_store({ content: "ADVANCED FINDINGS: ..." })

8. context_loop(...)
   → directive: { action: "verify", flaggedClaims: [...] }

9. verify_first({ candidateAnswer: "...", question: "..." })
   → accept/revise recommendations

10. probe_internal_state({ assistantOutput: "..." })
    → truthfulness classification per claim

11. check_logical_consistency({ claims: [...] })
    → consistency verification

12. [Generate final document]

13. context_loop({ messages: [...with full draft...] })
    → final depth/truth/grounding check

14. memory_store({ content: "FINAL RESEARCH..." })
15. memory_compact({})
16. memory_inspect({ tier: "overview" })
```

This would have used ~15 context-first tools across the session vs the 1 that was actually used.
