"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-8">Documentation</h1>

      {/* Overview */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Overview</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Context-First MCP is a{" "}
          <a
            href="https://modelcontextprotocol.io"
            className="text-brand-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Model Context Protocol
          </a>{" "}
          server that acts as a <strong>Context Custodian</strong> for LLM
          conversations. It addresses four structural gaps that degrade AI
          conversation quality over time.
        </p>
      </section>

      {/* Installation */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Installation</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-bold mb-2">Option 1: npx (recommended)</h3>
            <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: "0.5rem" }}>
              {"npx context-first-mcp"}
            </SyntaxHighlighter>
          </div>
          <div>
            <h3 className="font-bold mb-2">Option 2: Global install</h3>
            <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: "0.5rem" }}>
              {"npm install -g context-first-mcp"}
            </SyntaxHighlighter>
          </div>
          <div>
            <h3 className="font-bold mb-2">Option 3: Remote endpoint</h3>
            <SyntaxHighlighter language="text" style={vscDarkPlus} customStyle={{ borderRadius: "0.5rem" }}>
              {"https://context-first-mcp.vercel.app/api/mcp"}
            </SyntaxHighlighter>
          </div>
        </div>
      </section>

      {/* Tool Reference */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Tool Reference</h2>
        <div className="space-y-8">
          <ToolDoc
            name="recap_conversation"
            gap="Lost in Conversation"
            description="Analyzes conversation history to extract hidden intents, key decisions, and produces a consolidated state summary."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier (default: 'default')" },
              { name: "messages", type: "array", desc: "Array of {role, content, turn} message objects" },
              { name: "lookbackTurns", type: "number", desc: "Number of turns to analyze (default: 5)" },
            ]}
          />
          <ToolDoc
            name="detect_conflicts"
            gap="Context Clash"
            description="Compares new user input against established conversation ground truth."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "newMessage", type: "string", desc: "The new user message to check" },
            ]}
          />
          <ToolDoc
            name="check_ambiguity"
            gap="Calibration & Trust"
            description="Analyzes a requirement for underspecification and returns clarifying questions."
            params={[
              { name: "requirement", type: "string", desc: "The requirement to analyze" },
              { name: "context", type: "string?", desc: "Additional domain context" },
            ]}
          />
          <ToolDoc
            name="verify_execution"
            gap="Benchmark vs Reality"
            description="Validates that tool output actually achieved the stated goal."
            params={[
              { name: "goal", type: "string", desc: "What was supposed to happen" },
              { name: "output", type: "string", desc: "What actually happened" },
              { name: "expectedIndicators", type: "string[]?", desc: "Strings that indicate success" },
            ]}
          />
          <ToolDoc
            name="get_state"
            gap="State Management"
            description="Retrieve conversation ground truth — confirmed facts, decisions, and task status."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "keys", type: "string[]?", desc: "Specific keys to retrieve" },
            ]}
          />
          <ToolDoc
            name="set_state"
            gap="State Management"
            description="Lock in a confirmed fact or decision."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "key", type: "string", desc: "State key" },
              { name: "value", type: "any", desc: "Value to store" },
              { name: "source", type: "string?", desc: "Provenance (e.g., 'user-confirmed')" },
            ]}
          />
          <ToolDoc
            name="clear_state"
            gap="State Management"
            description="Remove specific keys or reset all conversation ground truth."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "keys", type: "string[]?", desc: "Keys to clear (omit for all)" },
            ]}
          />
          <ToolDoc
            name="get_history_summary"
            gap="History Compression"
            description="Compressed conversation history with annotations and decision tracking."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "maxTokens", type: "number", desc: "Target summary length (default: 500)" },
            ]}
          />
        </div>
      </section>

      {/* Layer 2 Tool Reference */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Layer 2 — Advanced Tools</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Research-backed tools for entropy monitoring, tool discovery, context
          quarantine, and verifiable abstention.
        </p>
        <div className="space-y-8">
          <ToolDoc
            name="discover_tools"
            gap="Active Discovery (MCP-Zero)"
            description="Describe what you need in natural language. Semantic routing returns only relevant tools, reducing context bloat by up to 98%."
            params={[
              { name: "query", type: "string", desc: "Natural language description of the capability needed" },
              { name: "maxResults", type: "number", desc: "Maximum tools to return (default: 5)" },
              { name: "threshold", type: "number", desc: "Minimum relevance score 0-1 (default: 0.1)" },
            ]}
          />
          <ToolDoc
            name="quarantine_context"
            gap="Context Quarantine"
            description="Isolate a sub-task in a memory silo. Creates a quarantine zone with its own state, preventing technical noise from polluting primary conversation intent."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "siloName", type: "string", desc: "Name for the quarantine silo" },
              { name: "ttlSeconds", type: "number", desc: "Time-to-live in seconds (default: 300)" },
              { name: "initialKeys", type: "Record<string, unknown>?", desc: "Initial state to seed the silo" },
            ]}
          />
          <ToolDoc
            name="merge_quarantine"
            gap="Context Quarantine"
            description="Merge quarantined context back into the main conversation. Selectively reintegrate findings from isolated sub-tasks."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "siloName", type: "string", desc: "Name of the silo to merge" },
              { name: "keysToMerge", type: "string[]?", desc: "Specific keys to merge (omit for all)" },
              { name: "discardAfterMerge", type: "boolean", desc: "Remove silo after merge (default: true)" },
            ]}
          />
          <ToolDoc
            name="entropy_monitor"
            gap="Entropy Detection (ERGO)"
            description="Monitor proxy entropy metrics to detect confusion spikes. Returns composite entropy score and sub-metrics. Triggers adaptive context reset when drift exceeds threshold."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "content", type: "string", desc: "Content to analyze for entropy" },
              { name: "threshold", type: "number", desc: "Entropy threshold for drift alert (default: 0.7)" },
              { name: "autoReset", type: "boolean", desc: "Auto-trigger context reset on spike (default: false)" },
            ]}
          />
          <ToolDoc
            name="abstention_check"
            gap="Verifiable Abstention (RLAAR)"
            description="Evaluates whether the model has enough verified information to proceed. Scores confidence across 5 dimensions and abstains with clarifying questions rather than hallucinating."
            params={[
              { name: "sessionId", type: "string", desc: "Session identifier" },
              { name: "claim", type: "string", desc: "The assertion the model wants to make" },
              { name: "threshold", type: "number", desc: "Minimum confidence to proceed (default: 0.7)" },
              { name: "dimensions", type: "string[]?", desc: "Specific dimensions to evaluate (omit for all 5)" },
            ]}
          />
        </div>
      </section>

      {/* Research Foundations */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Research Foundations</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Layer 2 features are grounded in peer-reviewed research. Each tool
          maps to a specific paper&apos;s methodology.
        </p>
        <div className="space-y-4">
          <ResearchRef
            tool="discover_tools"
            paper="MCP-Zero: Tool Discovery via Self-Routing"
            arxiv="2506.01056"
            methodology="Semantic embedding-based routing that matches natural language capability descriptions to tool metadata. Eliminates the need to expose all tools in the system prompt."
          />
          <ResearchRef
            tool="entropy_monitor"
            paper="ERGO: Entropy-Regulated Generative Orchestration"
            arxiv="2510.14077"
            methodology="Four proxy entropy metrics (lexical diversity, contradiction density, hedge-word frequency, repetition score) combined into a composite score. Detects output drift and triggers adaptive resets."
          />
          <ResearchRef
            tool="abstention_check"
            paper="RLAAR: Reinforcement Learning for Abstention and Active Retrieval"
            arxiv="2510.18731"
            methodology="Multi-dimensional confidence scoring across state completeness, recency, contradiction-free assessment, ambiguity-free assessment, and source quality. Models learn when to abstain vs. proceed."
          />
          <ResearchRef
            tool="quarantine_context / merge_quarantine"
            paper="ScaleMCP: Scaling Model Context Protocol"
            arxiv="2505.06416"
            methodology="Hierarchical state management with quarantine zones. Sub-tasks get isolated memory silos with TTL-based expiry to prevent context pollution."
          />
        </div>
      </section>

      {/* Architecture */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Architecture</h2>
        <SyntaxHighlighter language="text" style={vscDarkPlus} customStyle={{ borderRadius: "0.5rem", marginBottom: "1.5rem" }}>
{`┌─────────────────────────────────────────────────────────────┐
│        @xjtlumedia/context-first-mcp-server                 │
│                                                             │
│  Layer 1 (Core)              Layer 2 (Research-Backed)      │
│  ─────────────               ──────────────────────         │
│  recap_conversation          discover_tools (MCP-Zero)      │
│  detect_conflicts            quarantine_context (ScaleMCP)  │
│  check_ambiguity             merge_quarantine (ScaleMCP)    │
│  verify_execution            entropy_monitor (ERGO)         │
│  get/set/clear_state         abstention_check (RLAAR)       │
│  get_history_summary                                        │
│                                                             │
│           State Engine + Analysis Pipeline                   │
└──────────┬──────────────────────┬───────────────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │ stdio-server │        │remote-server│
    │   (npx)      │        │  (Vercel)   │
    │ Transport:   │        │ Transport:  │
    │   stdio      │        │ Streamable  │
    │              │        │    HTTP     │
    └──────────────┘        └─────────────┘`}
        </SyntaxHighlighter>
      </section>
    </div>
  );
}

function ToolDoc({
  name,
  gap,
  description,
  params,
}: {
  name: string;
  gap: string;
  description: string;
  params: Array<{ name: string; type: string; desc: string }>;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <code className="font-bold">{name}</code>
        <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
          {gap}
        </span>
      </div>
      <div className="p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {description}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-1 font-medium">Parameter</th>
              <th className="text-left py-1 font-medium">Type</th>
              <th className="text-left py-1 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr
                key={p.name}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="py-1 font-mono text-xs">{p.name}</td>
                <td className="py-1 text-xs text-gray-500">{p.type}</td>
                <td className="py-1 text-xs">{p.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResearchRef({
  tool,
  paper,
  arxiv,
  methodology,
}: {
  tool: string;
  paper: string;
  arxiv: string;
  methodology: string;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <a
            href={`https://arxiv.org/abs/${arxiv}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-sm text-brand-600 hover:underline"
          >
            {paper}
          </a>
          <span className="ml-2 text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
            arXiv:{arxiv}
          </span>
        </div>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        Tool: <code className="font-bold">{tool}</code>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">{methodology}</p>
    </div>
  );
}
