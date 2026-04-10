"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Segment {
  index: number;
  reasoning: string;
  summary: string;
  tokenCount: number;
  convergedWithPrevious: boolean;
}

interface InftyThinkResult {
  segments: Segment[];
  finalAnswer: string;
  totalSegments: number;
  converged: boolean;
  convergenceAtSegment: number | null;
  compressionRatio: number;
  sawtoothSummaries: string[];
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: "Algorithm Design",
    description: "Multi-step reasoning about sorting",
    problem: "Design an efficient algorithm that sorts a nearly-sorted array of 10 million integers where at most 1% of elements are out of place. What approach minimizes comparisons?",
  },
  {
    name: "Architecture Decision",
    description: "Complex trade-off analysis",
    problem: "Should we use microservices or a modular monolith for a startup with 5 engineers building a B2B SaaS product? Consider team size, deployment complexity, and iteration speed.",
  },
  {
    name: "Debugging Strategy",
    description: "Systematic problem decomposition",
    problem: "A production Node.js service has intermittent 502 errors that only occur under load (>1000 req/s). Memory usage is stable but CPU spikes to 100%. How should we diagnose the root cause?",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function InftyThinkDemo() {
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [customProblem, setCustomProblem] = useState("");
  const [maxSegments, setMaxSegments] = useState(6);
  const [convergenceThreshold, setConvergenceThreshold] = useState(0.85);
  const [result, setResult] = useState<InftyThinkResult | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedSegment, setExpandedSegment] = useState<number | null>(null);

  const runInftyThink = async () => {
    setRunning(true);
    setResult(null);

    const problem = customProblem || SCENARIOS[selectedScenario].problem;

    // Simulate the InftyThink iterative reasoning
    await new Promise(r => setTimeout(r, 800));

    const segments: Segment[] = [];
    const sawtoothSummaries: string[] = [];
    let converged = false;
    let convergenceAt: number | null = null;

    for (let i = 0; i < maxSegments; i++) {
      const tokenCount = 150 + Math.floor(Math.random() * 100);
      const convergedWithPrev = i > 2 && Math.random() > (1 - convergenceThreshold);

      segments.push({
        index: i,
        reasoning: `Segment ${i + 1}: Analyzing aspect ${i + 1} of the problem. ${
          i === 0 ? "Initial decomposition and framing." :
          i === 1 ? "Exploring primary constraints and trade-offs." :
          i === 2 ? "Evaluating candidate approaches against constraints." :
          `Refining solution with additional considerations (iteration ${i - 2}).`
        } Token budget used: ${tokenCount}/${200}.`,
        summary: `S${i + 1}: ${
          i === 0 ? "Problem framed — key dimensions identified" :
          i === 1 ? "Constraints mapped — feasibility assessed" :
          i === 2 ? "Top approaches ranked by criteria" :
          `Solution refined — confidence ${(0.6 + i * 0.08).toFixed(2)}`
        }`,
        tokenCount,
        convergedWithPrevious: convergedWithPrev,
      });

      if (i % 2 === 1) {
        sawtoothSummaries.push(`Sawtooth compress @${i + 1}: Merged segments ${i}-${i + 1} → summary`);
      }

      if (convergedWithPrev && !converged) {
        converged = true;
        convergenceAt = i;
      }
    }

    const actualSegments = converged && convergenceAt !== null
      ? segments.slice(0, convergenceAt + 1)
      : segments;

    setResult({
      segments: actualSegments,
      finalAnswer: `After ${actualSegments.length} iterative reasoning segments${converged ? " (converged early)" : ""}, the recommended approach is a structured solution addressing all ${actualSegments.length} identified aspects with progressive refinement.`,
      totalSegments: actualSegments.length,
      converged,
      convergenceAtSegment: convergenceAt,
      compressionRatio: 0.35 + Math.random() * 0.2,
      sawtoothSummaries,
    });

    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-xl p-6 border border-indigo-500/20">
        <h3 className="text-lg font-semibold text-indigo-300 mb-2">♾️ InftyThink — Iterative Bounded Reasoning</h3>
        <p className="text-sm text-gray-400">
          Breaks complex problems into bounded reasoning segments with sawtooth summarization.
          Each segment reasons within a token budget, and periodic compression prevents context bloat.
          Stops early when consecutive segments converge.
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
                ? "border-indigo-500 bg-indigo-500/10"
                : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
            }`}
          >
            <div className="text-sm font-medium text-white">{scenario.name}</div>
            <div className="text-xs text-gray-400 mt-1">{scenario.description}</div>
          </button>
        ))}
      </div>

      {/* Custom Problem Input */}
      <textarea
        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none h-20"
        placeholder="Or enter a custom problem..."
        value={customProblem}
        onChange={e => setCustomProblem(e.target.value)}
      />

      {/* Configuration */}
      <div className="flex gap-4 items-center">
        <label className="text-sm text-gray-400">
          Max Segments:
          <input type="number" min={2} max={12} value={maxSegments}
            onChange={e => setMaxSegments(Number(e.target.value))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-sm text-gray-400">
          Convergence:
          <input type="number" min={0.5} max={0.99} step={0.05} value={convergenceThreshold}
            onChange={e => setConvergenceThreshold(Number(e.target.value))}
            className="ml-2 w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
          />
        </label>
        <button
          onClick={runInftyThink}
          disabled={running}
          className="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-sm text-white transition-colors"
        >
          {running ? "Reasoning..." : "Run InftyThink"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Segments</div>
              <div className="text-xl font-bold text-white">{result.totalSegments}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Converged</div>
              <div className={`text-xl font-bold ${result.converged ? "text-green-400" : "text-yellow-400"}`}>
                {result.converged ? `@${result.convergenceAtSegment! + 1}` : "No"}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Compression</div>
              <div className="text-xl font-bold text-cyan-400">{(result.compressionRatio * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <div className="text-xs text-gray-400">Sawtooth Cycles</div>
              <div className="text-xl font-bold text-purple-400">{result.sawtoothSummaries.length}</div>
            </div>
          </div>

          {/* Sawtooth Visualization */}
          <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-3">Segment Progression (Sawtooth Pattern)</div>
            <div className="flex items-end gap-1 h-24">
              {result.segments.map((seg, i) => {
                const height = ((seg.tokenCount / 250) * 100);
                const isCompressed = i % 2 === 1;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t transition-all cursor-pointer ${
                        seg.convergedWithPrevious
                          ? "bg-green-500/70"
                          : isCompressed
                            ? "bg-indigo-400/70"
                            : "bg-indigo-600/70"
                      } ${expandedSegment === i ? "ring-2 ring-indigo-400" : ""}`}
                      style={{ height: `${height}%` }}
                      onClick={() => setExpandedSegment(expandedSegment === i ? null : i)}
                    />
                    <span className="text-[10px] text-gray-500">S{i + 1}</span>
                  </div>
                );
              })}
            </div>
            {isCompressed && (
              <div className="mt-2 flex gap-4 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-600/70 rounded-sm" /> Expand</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-400/70 rounded-sm" /> Compress</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500/70 rounded-sm" /> Converged</span>
              </div>
            )}
          </div>

          {/* Expanded Segment Detail */}
          {expandedSegment !== null && result.segments[expandedSegment] && (
            <div className="bg-gray-800/50 rounded-lg p-4 border border-indigo-500/30">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-indigo-300">
                  Segment {expandedSegment + 1} Detail
                </span>
                <span className="text-xs text-gray-400">
                  {result.segments[expandedSegment].tokenCount} tokens
                </span>
              </div>
              <p className="text-sm text-gray-300">{result.segments[expandedSegment].reasoning}</p>
              <p className="text-xs text-gray-500 mt-2 italic">{result.segments[expandedSegment].summary}</p>
            </div>
          )}

          {/* Final Answer */}
          <div className="bg-indigo-900/20 rounded-lg p-4 border border-indigo-500/20">
            <div className="text-xs text-indigo-400 mb-1">Final Synthesized Answer</div>
            <p className="text-sm text-gray-200">{result.finalAnswer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to check if any segment was compressed
const isCompressed = true;
