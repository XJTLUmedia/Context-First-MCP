import { ToolCard } from "../components/ToolCard";

const tools = [
  {
    name: "recap_conversation",
    gap: "Lost in Conversation",
    description:
      "Analyzes conversation history to extract hidden intents, key decisions, and produces a consolidated state summary. Prevents context degradation over long conversations.",
    color: "blue",
  },
  {
    name: "detect_conflicts",
    gap: "Context Clash",
    description:
      "Compares new user input against established ground truth. Detects contradictions, changed requirements, and shifted assumptions before they cause problems.",
    color: "red",
  },
  {
    name: "check_ambiguity",
    gap: "Calibration & Trust",
    description:
      "Analyzes requirements for underspecification. Returns clarifying questions and identifies vague language, undefined criteria, and missing edge cases.",
    color: "amber",
  },
  {
    name: "verify_execution",
    gap: "Benchmark vs Reality",
    description:
      "Validates that tool outputs actually achieved the stated goal. Checks for silent errors, partial completion, and goal-output alignment.",
    color: "green",
  },
  {
    name: "get_state / set_state / clear_state",
    gap: "State Management",
    description:
      "Lock in confirmed facts, decisions, and task status as conversation ground truth. Retrieve or reset state at any time.",
    color: "purple",
  },
  {
    name: "get_history_summary",
    gap: "History Compression",
    description:
      "Get a compressed conversation history with intent annotations, key decision points, topic progression, and open questions highlighted.",
    color: "indigo",
  },
];

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      {/* Hero */}
      <section className="text-center mb-20">
        <h1 className="text-5xl font-bold mb-6">
          Fight LLM Context Degradation
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-8">
          A <strong>Context Custodian</strong> MCP server with{" "}
          <strong>14 tools</strong> that keeps your AI conversations on track —
          from recap and conflict detection to entropy monitoring, context
          quarantine, verifiable abstention, and unified orchestration loop.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <a
            href="/demo"
            className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
          >
            Try Live Demo
          </a>
          <a
            href="/docs"
            className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors font-medium"
          >
            Read Docs
          </a>
        </div>
      </section>

      {/* Quick Start */}
      <section className="mb-20">
        <h2 className="text-3xl font-bold mb-6 text-center">Quick Start</h2>
        <div className="bg-gray-900 text-gray-100 rounded-lg p-6 max-w-2xl mx-auto">
          <p className="text-sm text-gray-400 mb-2"># Run with npx (no install needed)</p>
          <code className="text-green-400 text-lg">npx context-first-mcp</code>
          <div className="mt-6 pt-4 border-t border-gray-700">
            <p className="text-sm text-gray-400 mb-2"># Or use the remote endpoint</p>
            <code className="text-green-400 text-sm break-all">
              https://context-first-mcp.vercel.app/api/mcp
            </code>
          </div>
        </div>
      </section>

      {/* The Four Gaps */}
      <section className="mb-20">
        <h2 className="text-3xl font-bold mb-4 text-center">
          Solving Four Context Gaps
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-10 max-w-2xl mx-auto">
          Every long AI conversation suffers from these structural problems.
          Context-First MCP provides dedicated tools for each one.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {tools.map((tool) => (
            <ToolCard key={tool.name} {...tool} />
          ))}
        </div>
      </section>

      {/* Layer 2 — Advanced Features */}
      <section className="mb-20">
        <h2 className="text-3xl font-bold mb-4 text-center">
          Research-Backed Advanced Features
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-10 max-w-2xl mx-auto">
          4 peer-reviewed papers → 5 advanced MCP tools. Layer 2 brings
          entropy monitoring, tool discovery, context quarantine, and
          verifiable abstention.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <ToolCard
            name="discover_tools"
            gap="Active Discovery (MCP-Zero)"
            description="Describe what you need in natural language. Semantic routing returns only relevant tools, reducing context bloat by up to 98%."
            color="blue"
          />
          <ToolCard
            name="quarantine_context / merge_quarantine"
            gap="Context Quarantine"
            description="Isolate sub-tasks in memory silos. Prevents technical noise from polluting primary conversation intent."
            color="green"
          />
          <ToolCard
            name="entropy_monitor"
            gap="Entropy Detection (ERGO)"
            description="Proxy entropy metrics detect confusion spikes in model output. Triggers adaptive context reset when drift is detected."
            color="amber"
          />
          <ToolCard
            name="abstention_check"
            gap="Verifiable Abstention (RLAAR)"
            description="Evaluates whether the model has enough verified info to proceed. Abstains with clarifying questions rather than hallucinating."
            color="red"
          />
        </div>
      </section>

      {/* Research Foundations */}
      <section className="mb-20">
        <h2 className="text-3xl font-bold mb-6 text-center">
          Research Foundations
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-8 max-w-2xl mx-auto">
          Layer 2 features are grounded in peer-reviewed research.
        </p>
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          <PaperCard
            title="MCP-Zero: Tool Discovery via Self-Routing"
            arxiv="2506.01056"
            description="Semantic routing for MCP tool discovery. Reduces context bloat by matching natural language queries to tool capabilities."
          />
          <PaperCard
            title="ERGO: Entropy-Regulated Generative Orchestration"
            arxiv="2510.14077"
            description="Proxy entropy metrics to detect confusion and drift in LLM output. Triggers adaptive context resets."
          />
          <PaperCard
            title="RLAAR: Reinforcement Learning for Abstention"
            arxiv="2510.18731"
            description="Teaches models when to abstain rather than hallucinate. Multi-dimensional confidence scoring."
          />
          <PaperCard
            title="ScaleMCP: Scaling Model Context Protocol"
            arxiv="2505.06416"
            description="Addresses context window scalability with quarantine zones, hierarchical state management, and TTL-based memory."
          />
        </div>
      </section>

      {/* Client Config */}
      <section className="mb-20">
        <h2 className="text-3xl font-bold mb-6 text-center">
          Works With Your Client
        </h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div>
            <h3 className="font-bold mb-2">Claude Desktop / Cursor</h3>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
{`{
  "mcpServers": {
    "context-first": {
      "command": "npx",
      "args": ["-y", "context-first-mcp"]
    }
  }
}`}
            </pre>
          </div>
          <div>
            <h3 className="font-bold mb-2">VS Code (settings.json)</h3>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
{`{
  "mcp": {
    "servers": {
      "context-first": {
        "command": "npx",
        "args": ["-y", "context-first-mcp"]
      }
    }
  }
}`}
            </pre>
          </div>
          <div className="md:col-span-2">
            <h3 className="font-bold mb-2">Remote (Streamable HTTP)</h3>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
{`{
  "mcpServers": {
    "context-first": {
      "url": "https://context-first-mcp.vercel.app/api/mcp"
    }
  }
}`}
            </pre>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="text-center">
        <div className="flex gap-3 justify-center flex-wrap">
          <img
            alt="npm version"
            src="https://img.shields.io/npm/v/context-first-mcp?color=blue"
          />
          <img
            alt="license"
            src="https://img.shields.io/badge/license-MIT-green"
          />
          <img
            alt="MCP"
            src="https://img.shields.io/badge/MCP-compatible-purple"
          />
        </div>
      </section>
    </div>
  );
}

function PaperCard({
  title,
  arxiv,
  description,
}: {
  title: string;
  arxiv: string;
  description: string;
}) {
  return (
    <a
      href={`https://arxiv.org/abs/${arxiv}`}
      target="_blank"
      rel="noopener noreferrer"
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors block"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-sm">{title}</h3>
        <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded shrink-0 ml-2">
          arXiv:{arxiv}
        </span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">{description}</p>
    </a>
  );
}
