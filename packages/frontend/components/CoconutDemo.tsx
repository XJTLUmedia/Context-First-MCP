"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContinuousThought {
  step: number;
  latentNorm: number;
  confidence: number;
  decoded: string;
  isTerminal: boolean;
}

interface CoconutResult {
  thoughts: ContinuousThought[];
  finalAnswer: string;
  totalSteps: number;
  latentDimension: number;
  finalConfidence: number;
  earlyDecoded: boolean;
  decodedAtStep: number | null;
  planningScore: number;
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: "Planning Task",
    description: "Multi-step planning in latent space",
    problem: "Plan a database migration from PostgreSQL to a distributed CockroachDB cluster with zero downtime, handling 50TB of data across 3 regions.",
  },
  {
    name: "Creative Problem",
    description: "Breadth-first creative exploration",
    problem: "Design a novel caching strategy that adapts eviction policy based on real-time access pattern classification (LRU, LFU, or ARC) without requiring manual configuration.",
  },
  {
    name: "Abstract Reasoning",
    description: "Latent space exploration",
    problem: "What is the relationship between Conway's Game of Life cellular automaton patterns and the emergence of computational universality? How does this inform distributed systems design?",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CoconutDemo() {
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [customProblem, setCustomProblem] = useState("");
  const [maxSteps, setMaxSteps] = useState(8);
  const [latentDim, setLatentDim] = useState(64);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.8);
  const [result, setResult] = useState<CoconutResult | null>(null);
  const [running, setRunning] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const runCoconut = async () => {
    setRunning(true);
    setResult(null);

    await new Promise(r => setTimeout(r, 600));

    const thoughts: ContinuousThought[] = [];
    let earlyDecoded = false;
    let decodedAt: number | null = null;

    for (let i = 0; i < maxSteps; i++) {
      const confidence = 0.3 + (i / maxSteps) * 0.6 + Math.random() * 0.1;
      const clampedConf = Math.min(1, confidence);
      const isTerminal = clampedConf >= confidenceThreshold;

      thoughts.push({
        step: i,
        latentNorm: 0.8 + Math.random() * 0.4,
        confidence: Math.round(clampedConf * 1000) / 1000,
        decoded: i < 2
          ? `[Latent] Encoding problem structure (dim=${latentDim})`
          : i < maxSteps - 2
            ? `[Latent] Transforming: attention heads exploring ${3 + i} pathways`
            : `[Decoded] Solution crystallizing — confidence ${(clampedConf * 100).toFixed(1)}%`,
        isTerminal,
      });

      if (isTerminal && !earlyDecoded) {
        earlyDecoded = true;
        decodedAt = i;
        break;
      }
    }

    const actualThoughts = earlyDecoded && decodedAt !== null
      ? thoughts.slice(0, decodedAt + 1)
      : thoughts;

    setResult({
      thoughts: actualThoughts,
      finalAnswer: `Continuous thought converged after ${actualThoughts.length} latent steps${earlyDecoded ? " (early decode triggered)" : ""}. Solution synthesized from ${latentDim}-dimensional latent space with multi-head attention exploration.`,
      totalSteps: actualThoughts.length,
      latentDimension: latentDim,
      finalConfidence: actualThoughts[actualThoughts.length - 1]?.confidence ?? 0,
      earlyDecoded,
      decodedAtStep: decodedAt,
      planningScore: 0.65 + Math.random() * 0.3,
    });

    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-teal-900/30 to-cyan-900/30 rounded-xl p-6 border border-teal-500/20">
        <h3 className="text-lg font-semibold text-teal-300 mb-2">🥥 Coconut — Chain of Continuous Thought</h3>
        <p className="text-sm text-gray-400">
          Reasons in a continuous latent space instead of discrete tokens. Encodes the problem into a
          high-dimensional vector and iteratively transforms it through simulated multi-head attention layers.
          Decodes to text only when confidence exceeds the threshold.
        </p>
      </div>

      {/* Scenario Selector */}
      <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.map((scenario, i) => (
          <button
            key={i}
            onClick={() => { setSelectedScenario(i); setCustomProblem(""); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              selectedScenario === i && !customProblem
                ? "border-teal-500 bg-teal-500/10"
                : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
            }`}
          >
            <div className="text-sm font-medium text-white">{scenario.name}</div>
            <div className="text-xs text-gray-400 mt-1">{scenario.description}</div>
          </button>
        ))}
      </div>

      {/* Custom Problem */}
      <textarea
        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none h-20"
        placeholder="Or enter a custom problem..."
        value={customProblem}
        onChange={e => setCustomProblem(e.target.value)}
      />

      {/* Configuration */}
      <div className="flex gap-4 items-center flex-wrap">
        <label className="text-sm text-gray-400">
          Max Steps:
          <input type="number" min={3} max={20} value={maxSteps}
            onChange={e => setMaxSteps(Number(e.target.value))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-sm text-gray-400">
          Latent Dim:
          <input type="number" min={16} max={256} step={16} value={latentDim}
            onChange={e => setLatentDim(Number(e.target.value))}
            className="ml-2 w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-sm text-gray-400">
          Confidence:
          <input type="number" min={0.5} max={0.99} step={0.05} value={confidenceThreshold}
            onChange={e => setConfidenceThreshold(Number(e.target.value))}
            className="ml-2 w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <button
          onClick={runCoconut}
          disabled={running}
          className="ml-auto px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
        >
          {running ? "Thinking..." : "Run Coconut"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Latent Steps</div>
              <div className="text-xl font-bold text-white">{result.totalSteps}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Final Confidence</div>
              <div className="text-xl font-bold text-teal-400">{(result.finalConfidence * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Early Decode</div>
              <div className={`text-xl font-bold ${result.earlyDecoded ? "text-green-400" : "text-yellow-400"}`}>
                {result.earlyDecoded ? `Step ${result.decodedAtStep! + 1}` : "No"}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Planning Score</div>
              <div className="text-xl font-bold text-cyan-400">{(result.planningScore * 100).toFixed(0)}%</div>
            </div>
          </div>

          {/* Latent Space Visualization */}
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-3">Latent State Evolution</div>
            <div className="space-y-2">
              {result.thoughts.map((thought, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 cursor-pointer hover:bg-gray-700/30 rounded px-2 py-1 transition-colors"
                  onMouseEnter={() => setHoveredStep(i)}
                  onMouseLeave={() => setHoveredStep(null)}
                >
                  <div className="text-xs text-gray-500 w-8">t={i}</div>
                  {/* Confidence bar */}
                  <div className="flex-1 h-6 bg-gray-900 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all ${
                        thought.isTerminal
                          ? "bg-gradient-to-r from-teal-500 to-green-500"
                          : "bg-gradient-to-r from-teal-700 to-cyan-600"
                      }`}
                      style={{ width: `${thought.confidence * 100}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/70">
                      {(thought.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${
                    thought.isTerminal ? "bg-green-400 animate-pulse" : "bg-gray-600"
                  }`} />
                </div>
              ))}
            </div>
            {hoveredStep !== null && result.thoughts[hoveredStep] && (
              <div className="mt-3 p-2 bg-gray-900/50 rounded text-xs text-gray-300">
                <span className="text-teal-400">Step {hoveredStep}:</span>{" "}
                {result.thoughts[hoveredStep].decoded}
                <span className="text-gray-500 ml-2">
                  (‖z‖={result.thoughts[hoveredStep].latentNorm.toFixed(3)})
                </span>
              </div>
            )}
          </div>

          {/* Final Answer */}
          <div className="bg-teal-900/20 rounded-lg p-4 border border-teal-500/20">
            <div className="text-xs text-teal-400 mb-1">Decoded Answer</div>
            <p className="text-sm text-gray-200">{result.finalAnswer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
