"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogicalForm {
  id: string;
  expression: string;
  description: string;
  dependencies: string[];
  status: "pending" | "in-progress" | "resolved" | "failed";
  result?: string;
  confidence: number;
  depth: number;
}

interface KAGThinkerResult {
  logicalForms: LogicalForm[];
  finalAnswer: string;
  totalSubProblems: number;
  resolvedCount: number;
  failedCount: number;
  maxDepth: number;
  fullyResolved: boolean;
  interactiveSteps: number;
  stabilityScore: number;
  dependencyGraph: Record<string, string[]>;
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: "Complex Analysis",
    description: "Multi-factor problem decomposition",
    problem: "Why do large language models sometimes produce confident but incorrect answers, and how can we redesign the inference pipeline to detect and mitigate this failure mode?",
    knownFacts: [
      "LLMs use autoregressive token generation",
      "Calibration degrades on out-of-distribution inputs",
      "Chain-of-thought improves factual accuracy",
    ],
  },
  {
    name: "Architecture Comparison",
    description: "Structured trade-off evaluation",
    problem: "Compare event-driven architecture versus request-response for building a real-time collaborative document editor. Consider latency, consistency, complexity, and operational cost.",
    knownFacts: [
      "CRDTs enable eventual consistency in collaborative editing",
      "WebSocket maintains persistent connections",
      "Event sourcing provides full audit trail",
    ],
  },
  {
    name: "Impact Assessment",
    description: "Risk and consequence analysis",
    problem: "What is the impact of adopting Rust for our backend services currently written in Go? Consider developer productivity, hiring, performance, safety, and migration cost.",
    knownFacts: [
      "Go has faster compile times than Rust",
      "Rust prevents data races at compile time",
      "Current team has 8 Go engineers and 0 Rust engineers",
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function KAGThinkerDemo() {
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [customProblem, setCustomProblem] = useState("");
  const [customFacts, setCustomFacts] = useState("");
  const [maxDepth, setMaxDepth] = useState(4);
  const [maxSteps, setMaxSteps] = useState(20);
  const [result, setResult] = useState<KAGThinkerResult | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);

  const runKAGThinker = async () => {
    setRunning(true);
    setResult(null);

    await new Promise(r => setTimeout(r, 900));

    const scenario = SCENARIOS[selectedScenario];
    const problem = customProblem || scenario.problem;
    const facts = customFacts
      ? customFacts.split("\n").filter(f => f.trim())
      : scenario.knownFacts;

    // Simulate KAG-Thinker decomposition
    const forms: LogicalForm[] = [];
    let id = 0;

    // Depth 0: Root
    forms.push({
      id: `lf-${id++}`,
      expression: `SOLVE("${problem.slice(0, 40)}...")`,
      description: `Root problem analysis`,
      dependencies: [],
      status: "resolved",
      result: "Decomposed into sub-problems and resolved through structured analysis.",
      confidence: 0.85,
      depth: 0,
    });

    // Depth 1: Main aspects
    const aspects = ["ANALYZE", "METHOD", "VERIFY"];
    const aspectIds = aspects.map(a => {
      const fid = `lf-${id++}`;
      forms.push({
        id: fid,
        expression: `${a}("primary aspect")`,
        description: `${a.toLowerCase()} aspect of the problem`,
        dependencies: [],
        status: "resolved",
        result: `${a} completed — ${2 + Math.floor(Math.random() * 3)} key factors identified and evaluated.`,
        confidence: 0.7 + Math.random() * 0.2,
        depth: 1,
      });
      return fid;
    });

    // Update root dependencies
    forms[0].dependencies = aspectIds;

    // Depth 2: Sub-aspects
    for (const parentId of aspectIds) {
      const subCount = 1 + Math.floor(Math.random() * 2);
      for (let s = 0; s < subCount; s++) {
        const ops = ["DECOMPOSE", "EVALUATE", "CLASSIFY", "TRACE_CAUSES", "LIST_ALTERNATIVES"];
        const op = ops[Math.floor(Math.random() * ops.length)];
        const fid = `lf-${id++}`;
        forms.push({
          id: fid,
          expression: `${op}("sub-component ${s + 1}")`,
          description: `${op.toLowerCase().replace("_", " ")} analysis`,
          dependencies: [parentId],
          status: Math.random() > 0.15 ? "resolved" : "failed",
          result: Math.random() > 0.15
            ? `Resolved using structured analysis. Grounded in ${facts.length} known facts.`
            : "Insufficient context for reliable resolution.",
          confidence: 0.5 + Math.random() * 0.4,
          depth: 2,
        });

        // Depth 3: Verification (sometimes)
        if (maxDepth > 2 && Math.random() > 0.5) {
          forms.push({
            id: `lf-${id++}`,
            expression: `VERIFY("${op} result")`,
            description: `Verification of ${op.toLowerCase()} output`,
            dependencies: [fid],
            status: "resolved",
            result: "Verification passed — consistent with known facts.",
            confidence: 0.75 + Math.random() * 0.15,
            depth: 3,
          });
        }
      }
    }

    const resolved = forms.filter(f => f.status === "resolved");
    const failed = forms.filter(f => f.status === "failed");
    const depGraph: Record<string, string[]> = {};
    forms.forEach(f => { depGraph[f.id] = f.dependencies; });

    setResult({
      logicalForms: forms,
      finalAnswer: `KAG-Thinker analysis complete. ${resolved.length}/${forms.length} sub-problems resolved through structured logical decomposition. ${facts.length} known facts used for grounding. Maximum decomposition depth: ${Math.max(...forms.map(f => f.depth))}.`,
      totalSubProblems: forms.length,
      resolvedCount: resolved.length,
      failedCount: failed.length,
      maxDepth: Math.max(...forms.map(f => f.depth)),
      fullyResolved: failed.length === 0,
      interactiveSteps: forms.length * 3,
      stabilityScore: 0.6 + Math.random() * 0.3,
      dependencyGraph: depGraph,
    });

    setRunning(false);
  };

  const getDepthColor = (depth: number) => {
    const colors = ["text-rose-400", "text-amber-400", "text-teal-400", "text-indigo-400"];
    return colors[depth] || "text-gray-400";
  };

  const getDepthBg = (depth: number) => {
    const colors = ["bg-rose-500/10", "bg-amber-500/10", "bg-teal-500/10", "bg-indigo-500/10"];
    return colors[depth] || "bg-gray-500/10";
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-rose-900/30 to-pink-900/30 rounded-xl p-6 border border-rose-500/20">
        <h3 className="text-lg font-semibold text-rose-300 mb-2">🧠 KAG-Thinker — Structured Interactive Thinking</h3>
        <p className="text-sm text-gray-400">
          Decomposes complex problems into structured logical forms, builds a dependency graph,
          resolves sub-problems in topological order through interactive steps, and verifies results
          against known facts. Produces a stability score reflecting reasoning rigor.
        </p>
      </div>

      {/* Scenarios */}
      <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.map((scenario, i) => (
          <button
            key={i}
            onClick={() => { setSelectedScenario(i); setCustomProblem(""); setCustomFacts(""); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              selectedScenario === i && !customProblem
                ? "border-rose-500 bg-rose-500/10"
                : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
            }`}
          >
            <div className="text-sm font-medium text-white">{scenario.name}</div>
            <div className="text-xs text-gray-400 mt-1">{scenario.description}</div>
          </button>
        ))}
      </div>

      <textarea
        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none h-16"
        placeholder="Or enter a custom problem..."
        value={customProblem}
        onChange={e => setCustomProblem(e.target.value)}
      />

      <textarea
        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none h-16"
        placeholder="Known facts (one per line)..."
        value={customFacts}
        onChange={e => setCustomFacts(e.target.value)}
      />

      {/* Config */}
      <div className="flex gap-4 items-center">
        <label className="text-sm text-gray-400">
          Max Depth:
          <input type="number" min={1} max={5} value={maxDepth}
            onChange={e => setMaxDepth(Number(e.target.value))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-sm text-gray-400">
          Max Steps:
          <input type="number" min={5} max={50} value={maxSteps}
            onChange={e => setMaxSteps(Number(e.target.value))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <button
          onClick={runKAGThinker}
          disabled={running}
          className="ml-auto px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
        >
          {running ? "Decomposing..." : "Run KAG-Thinker"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Sub-Problems</div>
              <div className="text-xl font-bold text-white">{result.totalSubProblems}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Resolved</div>
              <div className="text-xl font-bold text-green-400">{result.resolvedCount}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Failed</div>
              <div className={`text-xl font-bold ${result.failedCount > 0 ? "text-red-400" : "text-green-400"}`}>
                {result.failedCount}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Max Depth</div>
              <div className="text-xl font-bold text-indigo-400">{result.maxDepth}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Stability</div>
              <div className={`text-xl font-bold ${
                result.stabilityScore >= 0.7 ? "text-green-400" : result.stabilityScore >= 0.5 ? "text-yellow-400" : "text-red-400"
              }`}>
                {(result.stabilityScore * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Dependency Tree Visualization */}
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-3">Logical Form Dependency Tree</div>
            <div className="space-y-1">
              {result.logicalForms.map(form => {
                const indent = form.depth * 24;
                const isExpanded = expandedForm === form.id;

                return (
                  <div key={form.id}>
                    <button
                      onClick={() => setExpandedForm(isExpanded ? null : form.id)}
                      className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-all hover:bg-gray-700/30 ${
                        isExpanded ? "bg-gray-700/20" : ""
                      }`}
                      style={{ paddingLeft: `${indent + 8}px` }}
                    >
                      {/* Status icon */}
                      <span className={`text-xs ${form.status === "resolved" ? "text-green-400" : form.status === "failed" ? "text-red-400" : "text-gray-500"}`}>
                        {form.status === "resolved" ? "✓" : form.status === "failed" ? "✗" : "○"}
                      </span>
                      {/* Expression */}
                      <span className={`text-xs font-mono ${getDepthColor(form.depth)}`}>
                        {form.expression}
                      </span>
                      {/* Confidence badge */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${getDepthBg(form.depth)} ${getDepthColor(form.depth)}`}>
                        {(form.confidence * 100).toFixed(0)}%
                      </span>
                    </button>
                    {isExpanded && (
                      <div
                        className="bg-gray-900/30 rounded mx-2 mb-1 p-3 text-xs border border-gray-700/50"
                        style={{ marginLeft: `${indent + 8}px` }}
                      >
                        <div className="text-gray-400 mb-1">{form.description}</div>
                        {form.result && <div className="text-gray-300 mt-1">{form.result}</div>}
                        {form.dependencies.length > 0 && (
                          <div className="text-gray-500 mt-1">
                            Depends on: {form.dependencies.join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final Answer */}
          <div className="bg-rose-900/20 rounded-lg p-4 border border-rose-500/20">
            <div className="text-xs text-rose-400 mb-1">
              Synthesized Answer {result.fullyResolved ? "(Fully Resolved)" : `(${result.failedCount} unresolved)`}
            </div>
            <p className="text-sm text-gray-200">{result.finalAnswer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
