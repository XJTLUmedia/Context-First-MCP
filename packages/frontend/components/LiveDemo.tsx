"use client";

import { useState } from "react";

interface ToolResult {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  timestamp: string;
}

interface DemoScenario {
  label: string;
  tool: string;
  input: Record<string, unknown>;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    label: "Check Ambiguity",
    tool: "check_ambiguity",
    input: {
      requirement: "Build a nice UI with some good features that works fast",
    },
  },
  {
    label: "Verify Execution",
    tool: "verify_execution",
    input: {
      goal: "Create a new file called config.json",
      output: "Error: EACCES permission denied, open '/etc/config.json'",
      expectedIndicators: ["created", "config.json"],
    },
  },
  {
    label: "Recap Conversation",
    tool: "recap_conversation",
    input: {
      sessionId: "demo",
      messages: [
        { role: "user", content: "Let's build a REST API with Express", turn: 1 },
        {
          role: "assistant",
          content: "I'll set up an Express server with TypeScript.",
          turn: 1,
        },
        {
          role: "user",
          content:
            "Actually, maybe we should use Fastify instead. Also don't forget we need WebSocket support later.",
          turn: 2,
        },
        {
          role: "assistant",
          content: "Switching to Fastify. I'll keep WebSocket in mind for phase 2.",
          turn: 2,
        },
        {
          role: "user",
          content: "Let's go with Express after all, it has better ecosystem",
          turn: 3,
        },
      ],
      lookbackTurns: 5,
    },
  },
  {
    label: "Detect Conflicts",
    tool: "detect_conflicts",
    input: {
      sessionId: "demo",
      newMessage:
        "Let's not use Express anymore, switch to Hono for edge deployment",
    },
  },
  {
    label: "Set State",
    tool: "set_state",
    input: {
      sessionId: "demo",
      key: "framework",
      value: "Express",
      source: "user-confirmed",
    },
  },
  {
    label: "Get State",
    tool: "get_state",
    input: { sessionId: "demo" },
  },
];

async function simulateToolCall(
  tool: string,
  input: Record<string, unknown>
): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  switch (tool) {
    case "check_ambiguity": {
      const req = input.requirement as string;
      const ambiguousWords = [
        "nice",
        "good",
        "fast",
        "some",
        "stuff",
        "things",
        "something",
      ];
      const found = ambiguousWords.filter((w) =>
        req.toLowerCase().includes(w)
      );
      const score = Math.min(1, 0.3 + found.length * 0.12);
      return {
        isAmbiguous: score > 0.5,
        score: Math.round(score * 100) / 100,
        clarifyingQuestions: [
          "What specific features should the UI include?",
          'How do you define "fast"? What is the target response time?',
          'What does "nice" mean in this context? Can you provide design references?',
        ],
        underspecifiedAreas: found.map((w) => `Vague term: "${w}"`),
      };
    }

    case "verify_execution": {
      const output = input.output as string;
      const hasError = /error|EACCES|denied|failed/i.test(output);
      const indicators = (input.expectedIndicators as string[]) || [];
      const matched = indicators.filter((i) =>
        output.toLowerCase().includes(i.toLowerCase())
      );
      const missed = indicators.filter(
        (i) => !output.toLowerCase().includes(i.toLowerCase())
      );
      return {
        isVerified: !hasError && missed.length === 0,
        confidence: hasError ? 0.15 : 0.85,
        issues: hasError
          ? ["Permission denied error detected — file was not created"]
          : [],
        matchedIndicators: matched,
        missedIndicators: missed,
      };
    }

    case "recap_conversation":
      return {
        summary:
          "5 messages across 3 turns. User initially chose Express, briefly considered Fastify, then reverted to Express. WebSocket support is a deferred (phase 2) requirement.",
        hiddenIntents: [
          'Deferred requirement: "WebSocket support later"',
          'Reference architecture: "better ecosystem" suggests prioritizing community/packages',
        ],
        keyDecisions: [
          "Chose Express over Fastify for ecosystem reasons",
          "WebSocket support deferred to phase 2",
        ],
        turn: 3,
        totalHistoryLength: 5,
      };

    case "detect_conflicts":
      return {
        hasConflicts: true,
        conflicts: [
          {
            existingKey: "framework",
            existingValue: "Express",
            conflictingStatement: "switch to Hono for edge deployment",
            severity: "high",
            suggestion:
              'Confirm with user: do they want to change "framework" from "Express" to "Hono"?',
          },
        ],
      };

    case "set_state":
      return {
        sessionId: input.sessionId,
        key: input.key,
        value: input.value,
        lockedAt: new Date().toISOString(),
        source: input.source,
        status: "locked",
      };

    case "get_state":
      return {
        sessionId: input.sessionId,
        entries: {
          framework: {
            value: "Express",
            lockedAt: new Date().toISOString(),
            source: "user-confirmed",
          },
        },
        count: 1,
      };

    default:
      return { error: "Unknown tool" };
  }
}

export function LiveDemo() {
  const [results, setResults] = useState<ToolResult[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTool(toolName: string, input: Record<string, unknown>) {
    setLoading(toolName);
    setError(null);
    try {
      const demoOutput = await simulateToolCall(toolName, input);
      setResults((prev) => [
        {
          tool: toolName,
          input,
          output: demoOutput,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        {DEMO_SCENARIOS.map((scenario) => (
          <button
            key={scenario.label}
            onClick={() => runTool(scenario.tool, scenario.input)}
            disabled={loading !== null}
            className="text-left border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50"
          >
            <span className="font-mono text-sm text-brand-600">
              {scenario.tool}
            </span>
            <p className="font-bold mt-1">{scenario.label}</p>
            <p className="text-xs text-gray-500 mt-1 truncate">
              {JSON.stringify(scenario.input).slice(0, 80)}...
            </p>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-4 text-gray-500">
          Running <span className="font-mono">{loading}</span>...
        </div>
      )}

      <div className="space-y-4">
        {results.map((result, i) => (
          <div
            key={i}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="font-mono text-sm font-bold">{result.tool}</span>
              <span className="text-xs text-gray-500">{result.timestamp}</span>
            </div>
            <div className="grid md:grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  INPUT
                </p>
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(result.input, null, 2)}
                </pre>
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  OUTPUT
                </p>
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(result.output, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
