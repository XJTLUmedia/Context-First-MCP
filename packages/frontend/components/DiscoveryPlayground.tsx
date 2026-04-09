"use client";

import { useState, useMemo } from "react";

interface ToolEntry {
  name: string;
  layer: 1 | 2;
  description: string;
  tags: string[];
}

interface SearchResult {
  tool: ToolEntry;
  score: number;
}

const TOOL_CATALOG: ToolEntry[] = [
  // Layer 1
  {
    name: "recap_conversation",
    layer: 1,
    description:
      "Analyzes conversation history to extract hidden intents, key decisions, and produces a consolidated state summary. Prevents context degradation over long conversations.",
    tags: ["recap", "summary", "conversation", "history", "intent", "decisions"],
  },
  {
    name: "detect_conflicts",
    layer: 1,
    description:
      "Compares new user input against established ground truth. Detects contradictions, changed requirements, and shifted assumptions.",
    tags: ["conflict", "contradiction", "requirements", "change", "detect", "compare"],
  },
  {
    name: "check_ambiguity",
    layer: 1,
    description:
      "Analyzes requirements for underspecification. Returns clarifying questions and identifies vague language, undefined criteria, and missing edge cases.",
    tags: ["ambiguity", "vague", "clarify", "requirements", "specification", "unclear"],
  },
  {
    name: "verify_execution",
    layer: 1,
    description:
      "Validates that tool outputs actually achieved the stated goal. Checks for silent errors, partial completion, and goal-output alignment.",
    tags: ["verify", "execution", "validate", "output", "goal", "errors", "check"],
  },
  {
    name: "get_state",
    layer: 1,
    description:
      "Retrieve conversation ground truth — confirmed facts, decisions, and task status. Query specific keys or get full state.",
    tags: ["state", "get", "retrieve", "facts", "decisions", "ground truth"],
  },
  {
    name: "set_state",
    layer: 1,
    description:
      "Lock in a confirmed fact or decision as conversation ground truth. Store values with provenance tracking.",
    tags: ["state", "set", "lock", "confirm", "fact", "decision", "store"],
  },
  {
    name: "clear_state",
    layer: 1,
    description:
      "Remove specific keys or reset all conversation ground truth. Clean up outdated or invalidated state.",
    tags: ["state", "clear", "reset", "remove", "clean"],
  },
  {
    name: "get_history_summary",
    layer: 1,
    description:
      "Get a compressed conversation history with intent annotations, key decision points, topic progression, and open questions highlighted.",
    tags: ["history", "summary", "compress", "annotations", "decisions", "topics"],
  },
  // Layer 2
  {
    name: "discover_tools",
    layer: 2,
    description:
      "Describe what you need in natural language. Semantic routing returns only relevant tools, reducing context bloat by up to 98%. Based on MCP-Zero research.",
    tags: ["discover", "search", "find", "tools", "semantic", "routing", "natural language"],
  },
  {
    name: "quarantine_context",
    layer: 2,
    description:
      "Isolate sub-tasks in memory silos. Creates a quarantine zone to prevent technical noise from polluting primary conversation intent.",
    tags: ["quarantine", "isolate", "silo", "context", "separate", "sub-task", "noise"],
  },
  {
    name: "merge_quarantine",
    layer: 2,
    description:
      "Merge quarantined context back into the main conversation. Selectively reintegrate findings from isolated sub-tasks.",
    tags: ["merge", "quarantine", "reintegrate", "context", "combine", "silo"],
  },
  {
    name: "entropy_monitor",
    layer: 2,
    description:
      "Monitor proxy entropy metrics to detect confusion spikes in model output. Triggers adaptive context reset when drift is detected. Based on ERGO research.",
    tags: ["entropy", "monitor", "confusion", "drift", "detect", "reset", "ERGO"],
  },
  {
    name: "abstention_check",
    layer: 2,
    description:
      "Evaluates whether the model has enough verified information to proceed. Abstains with clarifying questions rather than hallucinating. Based on RLAAR research.",
    tags: ["abstention", "confidence", "check", "hallucination", "verify", "RLAAR", "proceed"],
  },
];

function computeRelevance(query: string, tool: ToolEntry): number {
  if (!query.trim()) return 0;

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (queryTerms.length === 0) return 0;

  const corpus = `${tool.name} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase();

  let nameHits = 0;
  let descHits = 0;
  let tagHits = 0;

  for (const term of queryTerms) {
    if (tool.name.toLowerCase().includes(term)) nameHits++;
    if (tool.description.toLowerCase().includes(term)) descHits++;
    if (tool.tags.some((tag) => tag.includes(term))) tagHits++;
  }

  // Weighted scoring: name matches are worth more
  const nameScore = (nameHits / queryTerms.length) * 0.4;
  const tagScore = (tagHits / queryTerms.length) * 0.35;
  const descScore = (descHits / queryTerms.length) * 0.25;

  // Bonus for substring match in corpus
  const substringBonus = queryTerms.some((t) => corpus.includes(t)) ? 0.05 : 0;

  return Math.min(1, nameScore + tagScore + descScore + substringBonus);
}

export default function DiscoveryPlayground() {
  const [query, setQuery] = useState("");

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    return TOOL_CATALOG.map((tool) => ({
      tool,
      score: computeRelevance(query, tool),
    }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [query]);

  const topScore = results.length > 0 ? results[0].score : 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-950">
      <div className="mb-4">
        <h3 className="text-lg font-bold">Tool Discovery (MCP-Zero)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Describe what you need in natural language — semantic routing finds the right tools
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='e.g. "I need to check for contradictions" or "isolate a sub-task"'
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
      </div>

      {/* Quick examples */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          "check for contradictions",
          "isolate a sub-task",
          "model is confused",
          "should I proceed",
          "summarize what happened",
        ].map((example) => (
          <button
            key={example}
            onClick={() => setQuery(example)}
            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
          >
            {example}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      {query.trim() && (
        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 rounded px-3 py-2">
          Candidates scanned: {TOOL_CATALOG.length} | Matches: {results.length} | Top
          score: {(topScore * 100).toFixed(0)}%
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="grid gap-3">
          {results.map((r) => (
            <div
              key={r.tool.name}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <code className="font-bold text-sm">{r.tool.name}</code>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      r.tool.layer === 1
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                    }`}
                  >
                    Layer {r.tool.layer}
                  </span>
                </div>
                <span
                  className={`text-sm font-mono font-bold ${
                    r.score > 0.5
                      ? "text-green-600 dark:text-green-400"
                      : r.score > 0.2
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-gray-500"
                  }`}
                >
                  {(r.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                {r.tool.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {r.tool.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
          No matching tools found. Try different keywords.
        </div>
      )}

      {!query.trim() && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
          Enter a natural language query to discover relevant tools from the catalog of {TOOL_CATALOG.length}.
        </div>
      )}
    </div>
  );
}
